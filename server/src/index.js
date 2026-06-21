require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const app = require('./app');
const { client } = require('./services/discordClient');
const { startRefresher } = require('./services/cdnRefresher');

// Initialize databases
require('./db/connections');
console.log('Database initialized: users.db, community.db, knowledge.db, resources.db, guides.db, files.db, moderation.db');

// Start CDN Refresher when Discord client is ready
if (process.env.DISCORD_BOT_TOKEN) {
  client.once('ready', () => {
    startRefresher();
  });
} else {
  console.log('Discord Client is not configured. CDN Refresher is suspended.');
}

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
