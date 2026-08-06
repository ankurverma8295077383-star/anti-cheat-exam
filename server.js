const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection (Local या MongoDB Atlas URL)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/onlineExamDB';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.log('MongoDB Connection Error:', err.message));

// Schema for Exam Submissions & Violations
const submissionSchema = new mongoose.Schema({
    studentName: String,
    answers: Object,
    violations: Array,
    submittedAt: { type: Date, default: Date.now }
});

const Submission = mongoose.model('Submission', submissionSchema);

// API Route 1: Violation Log करने के लिए
app.post('/api/log-violation', (req, res) => {
    const { studentName, type, timestamp } = req.body;
    console.log(`[VIOLATION ALERT] ${studentName} -> ${type} at ${timestamp}`);
    res.json({ status: 'Logged' });
});

// API Route 2: Exam Submit करने के लिए
app.post('/api/submit-exam', async (req, res) => {
    try {
        const { studentName, answers, violations } = req.body;
        
        // MongoDB में डेटा सेव करें
        if (mongoose.connection.readyState === 1) {
            const newSubmission = new Submission({ studentName, answers, violations });
            await newSubmission.save();
        }
        
        console.log('Exam Submitted Successfully:', { studentName, answers, totalViolations: violations.length });
        res.json({ success: true, message: 'Exam submitted successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error saving submission' });
    }
});

const PORT = process.env.PORT || 3000;
// Admin API: सभी छात्रों का डेटा देखने के लिए
app.get('/api/all-submissions', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const submissions = await Submission.find().sort({ submittedAt: -1 });
            res.json(submissions);
        } else {
            res.status(500).json({ message: 'Database not connected' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error fetching submissions' });
    }
});
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));