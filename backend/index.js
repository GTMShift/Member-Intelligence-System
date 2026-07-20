require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const membersRouter = require('./routes/members');
const companiesRouter = require('./routes/companies');
const employmentRouter = require('./routes/employment');
const enrichmentRouter = require('./routes/enrichment');
const enrichmentStatusRouter = require('./routes/enrichmentStatus');
const eventsRouter = require('./routes/events');
const substackRouter = require('./routes/substackImport');
const formResponsesRouter = require('./routes/formResponses');

app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/members/:id/enrich', enrichmentRouter);
app.use('/enrich/status', enrichmentStatusRouter);
app.use('/members', membersRouter);
app.use('/companies', companiesRouter);
app.use('/members/:id/employment', employmentRouter);
app.use('/events', eventsRouter);
app.use('/substack', substackRouter);
app.use('/form-responses', formResponsesRouter);

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));