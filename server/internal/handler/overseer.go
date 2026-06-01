package handler

// Overseer (总管) — fork-only cross-workspace coordinator. User-scoped: each
// user has at most one overseer. All routes are mounted inside the authed
// user-scoped group (see RegisterOverseerRoutes), and every workspace the
// caller references is verified to be one they are a member of — the overseer
// must never become a cross-workspace access bypass.

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// RegisterOverseerRoutes mounts the overseer endpoints. Call this once from
// router.go inside the authenticated user-scoped group.
func RegisterOverseerRoutes(r chi.Router, h *Handler) {
	r.Route("/api/overseer", func(r chi.Router) {
		r.Get("/", h.GetOverseer)
		r.Put("/", h.UpdateOverseer)
		r.Put("/workspaces/{workspaceId}", h.UpsertOverseerWorkspace)
		r.Delete("/workspaces/{workspaceId}", h.DeleteOverseerWorkspace)
	})
}

type OverseerWorkspaceResponse struct {
	WorkspaceID string  `json:"workspace_id"`
	Status      string  `json:"status"`
	CadenceCron *string `json:"cadence_cron"`
}

type OverseerResponse struct {
	ID              string                      `json:"id"`
	HqWorkspaceID   *string                     `json:"hq_workspace_id"`
	AgentID         *string                     `json:"agent_id"`
	AttentionConfig json.RawMessage             `json:"attention_config"`
	Workspaces      []OverseerWorkspaceResponse `json:"workspaces"`
}

func nullableUUIDToPtr(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuidToString(u)
	return &s
}

func (h *Handler) overseerToResponse(ov db.Overseer, ws []db.OverseerWorkspace) OverseerResponse {
	cfg := ov.AttentionConfig
	if len(cfg) == 0 {
		cfg = []byte("{}")
	}
	out := OverseerResponse{
		ID:              uuidToString(ov.ID),
		HqWorkspaceID:   nullableUUIDToPtr(ov.HqWorkspaceID),
		AgentID:         nullableUUIDToPtr(ov.AgentID),
		AttentionConfig: json.RawMessage(cfg),
		Workspaces:      make([]OverseerWorkspaceResponse, 0, len(ws)),
	}
	for _, w := range ws {
		out.Workspaces = append(out.Workspaces, OverseerWorkspaceResponse{
			WorkspaceID: uuidToString(w.WorkspaceID),
			Status:      w.Status,
			CadenceCron: textToPtr(w.CadenceCron),
		})
	}
	return out
}

// getOrCreateOverseer returns the caller's overseer, creating an empty one on
// first access so the UI always has a stable id to attach watches to.
func (h *Handler) getOrCreateOverseer(r *http.Request, userUUID pgtype.UUID) (db.Overseer, error) {
	ov, err := h.Queries.GetOverseerByOwner(r.Context(), userUUID)
	if err == nil {
		return ov, nil
	}
	if !isNotFound(err) {
		return db.Overseer{}, err
	}
	return h.Queries.CreateOverseer(r.Context(), userUUID)
}

func (h *Handler) requireWorkspaceMembership(w http.ResponseWriter, r *http.Request, userUUID, wsUUID pgtype.UUID) bool {
	_, err := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
		UserID:      userUUID,
		WorkspaceID: wsUUID,
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "not a member of that workspace")
		return false
	}
	return true
}

func (h *Handler) GetOverseer(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	userUUID := parseUUID(userID)
	ov, err := h.getOrCreateOverseer(r, userUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load overseer")
		return
	}
	ws, err := h.Queries.ListOverseerWorkspaces(r.Context(), ov.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load watched workspaces")
		return
	}
	writeJSON(w, http.StatusOK, h.overseerToResponse(ov, ws))
}

type UpdateOverseerRequest struct {
	HqWorkspaceID   *string         `json:"hq_workspace_id"`
	AgentID         *string         `json:"agent_id"`
	AttentionConfig json.RawMessage `json:"attention_config"`
}

func (h *Handler) UpdateOverseer(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	var req UpdateOverseerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	userUUID := parseUUID(userID)
	ov, err := h.getOrCreateOverseer(r, userUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load overseer")
		return
	}

	// Optional hq workspace — when set, the caller must be a member of it.
	var hqUUID pgtype.UUID
	if req.HqWorkspaceID != nil && *req.HqWorkspaceID != "" {
		parsed, ok := parseUUIDOrBadRequest(w, *req.HqWorkspaceID, "hq_workspace_id")
		if !ok {
			return
		}
		if !h.requireWorkspaceMembership(w, r, userUUID, parsed) {
			return
		}
		hqUUID = parsed
	}

	var agentUUID pgtype.UUID
	if req.AgentID != nil && *req.AgentID != "" {
		parsed, ok := parseUUIDOrBadRequest(w, *req.AgentID, "agent_id")
		if !ok {
			return
		}
		agentUUID = parsed
	}

	cfg := req.AttentionConfig
	if len(cfg) == 0 {
		cfg = []byte("{}")
	}

	updated, err := h.Queries.UpdateOverseer(r.Context(), db.UpdateOverseerParams{
		ID:              ov.ID,
		HqWorkspaceID:   hqUUID,
		AgentID:         agentUUID,
		AttentionConfig: cfg,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update overseer")
		return
	}
	ws, err := h.Queries.ListOverseerWorkspaces(r.Context(), updated.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load watched workspaces")
		return
	}
	writeJSON(w, http.StatusOK, h.overseerToResponse(updated, ws))
}

type UpsertOverseerWorkspaceRequest struct {
	Status      string  `json:"status"`
	CadenceCron *string `json:"cadence_cron"`
}

var validWatchStatuses = map[string]struct{}{"active": {}, "paused": {}, "done": {}}

func (h *Handler) UpsertOverseerWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "workspaceId"), "workspaceId")
	if !ok {
		return
	}
	var req UpsertOverseerWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}
	if _, valid := validWatchStatuses[req.Status]; !valid {
		writeError(w, http.StatusBadRequest, "status must be active, paused, or done")
		return
	}

	userUUID := parseUUID(userID)
	if !h.requireWorkspaceMembership(w, r, userUUID, wsUUID) {
		return
	}
	ov, err := h.getOrCreateOverseer(r, userUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load overseer")
		return
	}

	var cadence pgtype.Text
	if req.CadenceCron != nil && *req.CadenceCron != "" {
		cadence = pgtype.Text{String: *req.CadenceCron, Valid: true}
	}

	if _, err := h.Queries.UpsertOverseerWorkspace(r.Context(), db.UpsertOverseerWorkspaceParams{
		OverseerID:  ov.ID,
		WorkspaceID: wsUUID,
		Status:      req.Status,
		CadenceCron: cadence,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save watched workspace")
		return
	}
	ws, err := h.Queries.ListOverseerWorkspaces(r.Context(), ov.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load watched workspaces")
		return
	}
	writeJSON(w, http.StatusOK, h.overseerToResponse(ov, ws))
}

func (h *Handler) DeleteOverseerWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "workspaceId"), "workspaceId")
	if !ok {
		return
	}
	userUUID := parseUUID(userID)
	ov, err := h.getOrCreateOverseer(r, userUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load overseer")
		return
	}
	if err := h.Queries.DeleteOverseerWorkspace(r.Context(), db.DeleteOverseerWorkspaceParams{
		OverseerID:  ov.ID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove watched workspace")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
