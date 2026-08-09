const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/onlineExamDB';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => console.log('MongoDB Connection Error:', err.message));

// 1. Final Submission Schema
const submissionSchema = new mongoose.Schema({
    studentName: String,
    studentId: String,
    answers: Object,
    violations: Array,
    submittedAt: { type: Date, default: Date.now }
});
const Submission = mongoose.model('Submission', submissionSchema);

// 2. Active Session Schema (RAM ki jagah Database mein token save karne ke liye)
const activeSessionSchema = new mongoose.Schema({
    token: String,
    studentName: String,
    studentId: String,
    violations: Array,
    createdAt: { type: Date, default: Date.now, expires: '12h' } // 12 ghante baad auto-delete
});
const ActiveSession = mongoose.model('ActiveSession', activeSessionSchema);

// --- SECURITY ENGINE ---
// 🛑 NAYA: Exam ke liye ek Secret Key set karein
const SECRET_EXAM_KEY = "GIS2026"; // <-- Yahan apna password/key likho jo tum students ko doge

// API 1: Exam Start Karein aur Token lein
app.post('/api/start-exam', async (req, res) => {
    const { studentName, studentId, examKey } = req.body;
    
    if (!studentName || !studentId || !examKey) {
        return res.status(400).json({ error: "Name, ID, and Exam Key required" });
    }

    // 🛑 Key Verification Logic
    if (examKey !== SECRET_EXAM_KEY) {
        return res.status(401).json({ error: "गलत Exam Key! कृपया सही Key दर्ज करें।" });
    }
    
    const token = crypto.randomUUID();
    
    try {
        if (mongoose.connection.readyState === 1) {
            // Token ab database me save hoga
            const newSession = new ActiveSession({ token, studentName, studentId, violations: [] });
            await newSession.save();
        }
        res.json({ success: true, token });
    } catch (error) {
        res.status(500).json({ error: "Failed to create session" });
    }
});

// API 2: Violation Log
app.post('/api/logs', async (req, res) => {
    const { token, violationType } = req.body;
    
    try {
        if (mongoose.connection.readyState === 1) {
            // Token database me verify karna
            const session = await ActiveSession.findOne({ token });
            if (!session) return res.status(401).json({ error: "Unauthorized session" });
            
            session.violations.push({ type: violationType, time: new Date().toLocaleTimeString() });
            await session.save();
            
            console.log(`[VIOLATION ALERT] ${session.studentName} -> ${violationType}`);
            res.json({ status: 'Logged', totalViolations: session.violations.length });
        }
    } catch (error) {
        res.status(500).json({ error: "Log failed" });
    }
});

// API 3: Final Exam Submit
app.post('/api/submit-exam', async (req, res) => {
    const { token, answers } = req.body;
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Invalid session or direct API bypass detected!' });
    }

    try {
        if (mongoose.connection.readyState === 1) {
            // Database se session uthao
            const session = await ActiveSession.findOne({ token });
            
            if (!session) {
                return res.status(401).json({ success: false, message: 'Session expired. API Bypass Detected!' });
            }

            const newSubmission = new Submission({ 
                studentName: session.studentName,
                studentId: session.studentId,
                answers, 
                violations: session.violations 
            });
            await newSubmission.save();
            
            // Submit hone ke baad session table se delete kar do
            await ActiveSession.deleteOne({ token });
            
            console.log('Exam Submitted:', { studentName: session.studentName, violations: session.violations.length });
            res.json({ success: true, message: 'Exam submitted successfully!' });
        } else {
            res.status(500).json({ success: false, message: 'Database offline' });
        }
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

// API 5: Clear All Exam History (Admin Feature)
app.delete('/api/clear-submissions', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await Submission.deleteMany({});
            res.json({ success: true, message: 'All records deleted successfully!' });
        } else {
            res.status(500).json({ success: false, message: 'Database not connected' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting records' });
    }
});

// 🛑 NAYA API 6: Delete Single Student Submission
app.delete('/api/delete-submission/:id', async (req, res) => {
    try {
        if (mongoose.connection.readyState === 1) {
            const deletedRecord = await Submission.findByIdAndDelete(req.params.id);
            if (deletedRecord) {
                res.json({ success: true, message: 'Record deleted successfully!' });
            } else {
                res.status(404).json({ success: false, message: 'Record not found' });
            }
        } else {
            res.status(500).json({ success: false, message: 'Database not connected' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting record' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
