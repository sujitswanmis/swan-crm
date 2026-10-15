const fs = require('fs');
const path = require('path');

const configDir = path.join('e:/swan hosting', 'src', 'config');
const { PREBUILT_EMAIL_TEMPLATES } = require('./crmPreBuiltTemplates.js');

const filesToSync = [
  'email_campaign_settings_new_swan_group.json',
  'email_campaign_settings_testing_new_swan_group.json',
  'email_campaign_settings.json'
];

for (const fileName of filesToSync) {
  const filePath = path.join(configDir, fileName);
  if (!fs.existsSync(filePath)) continue;

  const content = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content || '{}');

  const comp = fileName.includes('new_swan') ? 'New Swan Group' : 'SuPuja Creations';
  
  // Clone prebuilt templates with appropriate client_name
  const syncedTemplates = PREBUILT_EMAIL_TEMPLATES.map(t => ({
    ...t,
    client_name: comp,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  json.templates = syncedTemplates;
  json.updated_at = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
  console.log(`Synced ${fileName}: ${syncedTemplates.length} visual drag & drop templates written.`);
}
