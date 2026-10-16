-- Release 1's leads:assign (R16): reassigning leads, choosing a lead's owner, giving tasks to others and blocking
-- contacts. A new organization's Admin role gets it from the catalog; ADR 0005 changes no existing role by itself,
-- so every organization's Admin role (org-admin) is given it here, once. Custom roles are left to their Owners.
INSERT INTO role_permission (organization_id, role_id, permission, scope)
SELECT organization_id, id, 'leads:assign', NULL
FROM role
WHERE key = 'org-admin' AND deleted_at IS NULL
ON CONFLICT DO NOTHING;
