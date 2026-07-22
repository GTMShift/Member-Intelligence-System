const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

app.use(express.json());

const membersRouter = require('./routes/members');
const companiesRouter = require('./routes/companies');
const employmentRouter = require('./routes/employment');
const enrichmentRouter = require('./routes/enrichment');
const formResponsesRouter = require('./routes/formResponses');

app.use('/members', membersRouter);
app.use('/companies', companiesRouter);
app.use('/members/:id/employment', employmentRouter);
app.use('/members/:id/enrich', enrichmentRouter);
app.use('/form-responses', formResponsesRouter);

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const eventsRouter = require('./routes/events');
app.use('/events', eventsRouter);

const substackRouter = require('./routes/substackImport');
app.use('/substack', substackRouter);