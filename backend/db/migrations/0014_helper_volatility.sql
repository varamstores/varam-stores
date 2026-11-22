-- 0014 Error/auth helpers only read data or raise, so they are STABLE. This lets read-only
--      (STABLE) api functions call them without plpgsql_check volatility warnings.
alter function app.raise_error(text, integer, jsonb, text) stable;
alter function app.require_user() stable;
alter function app.require_permission(text) stable;

select app.harden();
