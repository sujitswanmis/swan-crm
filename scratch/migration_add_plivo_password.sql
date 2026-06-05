-- Step 1: Add plivo_password column to call_agents table
ALTER TABLE call_agents ADD COLUMN IF NOT EXISTS plivo_password TEXT;

-- Step 2: Populate passwords for known Plivo endpoints
UPDATE call_agents SET plivo_password = 'Admin@102023'         WHERE plivo_username = 'admin434792858589734357666520';
UPDATE call_agents SET plivo_password = 'nsmlrtc0001@2026'     WHERE plivo_username = 'nsmlrtc3939694880445266';
UPDATE call_agents SET plivo_password = 'nsmlrtc0002@2026'     WHERE plivo_username = 'nsmlrtc2657389236553295188';
UPDATE call_agents SET plivo_password = 'nsmlrtc0003@2026'     WHERE plivo_username = 'nsmlrtc93506189021999878029640';
UPDATE call_agents SET plivo_password = 'nsmlrtcwfh0001@2026'  WHERE plivo_username = 'nsmlrtcwfh7858930679233146509';
UPDATE call_agents SET plivo_password = 'nsmlrtcwfh0002@2026'  WHERE plivo_username = 'nsmlrtcwfh50549708164654573585';
UPDATE call_agents SET plivo_password = 'nsmlrtcwfh0003@2026'  WHERE plivo_username = 'nsmlrtcwfh44743598016079150111';
UPDATE call_agents SET plivo_password = 'nsmlrsc0001@2026'     WHERE plivo_username = 'nsmlrsc6682352866161309';
UPDATE call_agents SET plivo_password = 'nsmlrsc0002@2026'     WHERE plivo_username = 'nsmlrsc138629850811621019308';
UPDATE call_agents SET plivo_password = 'nsmlrsc0003@2026'     WHERE plivo_username = 'nsmlrsc22284111935640519288335';
UPDATE call_agents SET plivo_password = 'nsmlrsc0004@2026'     WHERE plivo_username = 'nsmlrsc7239711313208619777947';
UPDATE call_agents SET plivo_password = 'nsmlrpc0001@2026'     WHERE plivo_username = 'nsmlrpc60874839457118966';
UPDATE call_agents SET plivo_password = 'nsmlrpc0002@2026'     WHERE plivo_username = 'nsmlrpc179667757286621';

-- Verify
SELECT id, display_name, plivo_username, plivo_password FROM call_agents;
