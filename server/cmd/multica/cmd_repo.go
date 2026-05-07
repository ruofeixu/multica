package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var repoCmd = &cobra.Command{
	Use:   "repo",
	Short: "Work with repositories",
}

var repoCheckoutCmd = &cobra.Command{
	Use:   "checkout <url-or-local-path>",
	Short: "Check out a repository into the working directory",
	Long:  "Creates a git worktree from the daemon's bare clone cache or a local repository path. Used by agents to check out repos on demand.",
	Args:  exactArgs(1),
	RunE:  runRepoCheckout,
}

var repoCheckoutRef string

func init() {
	repoCheckoutCmd.Flags().StringVar(&repoCheckoutRef, "ref", "", "branch, tag, or commit to check out instead of the remote default branch")
	repoCmd.AddCommand(repoCheckoutCmd)
}

func runRepoCheckout(cmd *cobra.Command, args []string) error {
	target := args[0]

	daemonPort := os.Getenv("MULTICA_DAEMON_PORT")
	if daemonPort == "" {
		return fmt.Errorf("MULTICA_DAEMON_PORT not set (this command is intended to be run by an agent inside a daemon task)")
	}

	workspaceID := os.Getenv("MULTICA_WORKSPACE_ID")
	agentName := os.Getenv("MULTICA_AGENT_NAME")
	taskID := os.Getenv("MULTICA_TASK_ID")

	// Use current working directory as the checkout target.
	workDir, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("get working directory: %w", err)
	}

	// Detect whether the argument is a local path or a remote URL.
	// A local path starts with '/' (absolute) or './' / '../' (relative).
	// Everything else is treated as a remote URL.
	reqBody := map[string]string{
		"workspace_id": workspaceID,
		"workdir":      workDir,
		"ref":          repoCheckoutRef,
		"agent_name":   agentName,
		"task_id":      taskID,
	}
	if isLocalPath(target) {
		reqBody["local_path"] = target
	} else {
		reqBody["url"] = target
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("encode request: %w", err)
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Post(
		fmt.Sprintf("http://127.0.0.1:%s/repo/checkout", daemonPort),
		"application/json",
		bytes.NewReader(data),
	)
	if err != nil {
		return fmt.Errorf("connect to daemon: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("checkout failed: %s", string(body))
	}

	var result struct {
		Path       string `json:"path"`
		BranchName string `json:"branch_name"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return fmt.Errorf("parse response: %w", err)
	}

	fmt.Fprintf(os.Stdout, "%s\n", result.Path)
	fmt.Fprintf(os.Stderr, "Checked out %s → %s (branch: %s)\n", target, result.Path, result.BranchName)

	return nil
}

// isLocalPath reports whether s looks like a filesystem path rather than a
// remote git URL. Absolute paths and relative paths starting with ./ or ../
// are treated as local; everything else is a URL.
func isLocalPath(s string) bool {
	if len(s) == 0 {
		return false
	}
	if s[0] == '/' {
		return true
	}
	if len(s) >= 2 && s[0] == '.' && (s[1] == '/' || s[1] == '\\') {
		return true
	}
	if len(s) >= 3 && s[0] == '.' && s[1] == '.' && (s[2] == '/' || s[2] == '\\') {
		return true
	}
	return false
}
