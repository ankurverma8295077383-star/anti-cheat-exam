const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto'); // Token generate karne ke liye

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/onlineExamDB';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.log('MongoDB Connection Error:', err.message));

// Schema Update
const submissionSchema = new mongoose.Schema({
    studentName: String,
    studentId: String,
    answers: Object,
    violations: Array,
    submittedAt: { type: Date, default: Date.now }
});
const Submission = mongoose.model('Submission', submissionSchema);

// --- SECURITY ENGINE: Server-Side Tracking ---
const activeExams = new Map();

// API 1: Exam Start Karein aur Token lein
app.post('/api/start-exam', (req, res) => {
    const { studentName, studentId } = req.body;
    if (!studentName || !studentId) return res.status(400).json({ error: "Name and ID required" });
    
    const token = crypto.randomUUID(); // Unique secure token
    activeExams.set(token, { studentName, studentId, violations: [] });
    res.json({ success: true, token });
});

// API 2: Violation Log (Synced with frontend)
app.post('/api/logs', (req, res) => {
    const { token, violationType } = req.body;
    
    if (!token || !activeExams.has(token)) {
        return res.status(401).json({ error: "Unauthorized session" });
    }
    
    const session = activeExams.get(token);
    session.violations.push({ type: violationType, time: new Date().toLocaleTimeString() });
    
    console.log(`[VIOLATION ALERT] ${session.studentName} -> ${violationType}`);
    res.json({ status: 'Logged', totalViolations: session.violations.length });
});

// API 3: Final Exam Submit
app.post('/api/submit-exam', async (req, res) => {
    const { token, answers } = req.body;
    
    // API Bypass Check
    if (!token || !activeExams.has(token)) {
        return res.status(401).json({ success: false, message: 'Invalid session or direct API bypass detected!' });
    }

    const session = activeExams.get(token);
    try {
        if (mongoose.connection.readyState === 1) {
            const newSubmission = new Submission({ 
                studentName: session.studentName,
                studentId: session.studentId,
                answers, 
                violations: session.violations 
            });
            await newSubmission.save();
        }
        
        activeExams.delete(token); // Submit hone ke baad session hata dein
        
        console.log('Exam Submitted:', { studentName: session.studentName, violations: session.violations.length });
        res.json({ success: true, message: 'Exam submitted successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error saving submission' });
    }
});

// API 4: Admin Panel Data
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
