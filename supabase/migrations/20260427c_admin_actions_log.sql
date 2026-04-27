-- Audit trail for sensitive admin actions (LGPD Art. 50, II compliance)
CREATE TABLE IF NOT EXISTS public.admin_actions_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_resource_type text,
  target_resource_id text,
  ip_address inet,
  user_agent text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_actor ON public.admin_actions_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON public.admin_actions_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action ON public.admin_actions_log(action);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions_log(created_at DESC);

ALTER TABLE public.admin_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_actions_log_admin_select" ON public.admin_actions_log
  FOR SELECT USING (public.is_admin());
CREATE POLICY "admin_actions_log_self_select" ON public.admin_actions_log
  FOR SELECT USING (target_user_id = auth.uid());
CREATE POLICY "admin_actions_log_service_insert" ON public.admin_actions_log
  FOR INSERT WITH CHECK (true); -- Edge functions write via service role
