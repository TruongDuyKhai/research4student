const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { apiLimiter } = require('./middleware');
const authRouter = require('./routes/auth');
const filesRouter = require('./routes/files');
const usersRouter = require('./routes/users');
const knowledgeRouter = require('./routes/knowledge');
const resourcesRouter = require('./routes/resources');
const guidesRouter = require('./routes/guides');
const projectsRouter = require('./routes/projects');
const communityRouter = require('./routes/community');
const adminRouter = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/config', require('./routes/config'));
app.use('/api/files', filesRouter);
app.use('/api/users', usersRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/guides', guidesRouter);
app.use('/api/community/projects', projectsRouter);
app.use('/api/community', communityRouter);
app.use('/api/admin', adminRouter);

// API Health Check Route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    data: {
      status: 'ok'
    }
  });
});

module.exports = app;
