import axios from 'axios';
import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: 'test', role: 'admin' }, 'your_super_secret_jwt_key_here', { expiresIn: '1h' });

async function test() {
    try {
        console.log("Testing Hifz Logs...");
        const res1 = await axios.get("http://localhost:5000/api/hifz/logs?student_id=R004&start_date=2026-01-11T05:00:44.955Z&end_date=2026-03-12T05:00:44.955Z", {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Hifz Logs Success:", res1.data);
    } catch (e: any) {
        console.error("Hifz Logs Error:", e.response?.data || e.message);
    }
    
    try {
        console.log("\nTesting Attendance...");
        const res2 = await axios.get("http://localhost:5000/api/academics/attendance?student_id=R004&start_date=2026-01-11T05:00:44.955Z&end_date=2026-03-12T05:00:44.955Z&department=Hifz", {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("Attendance Success:", res2.data);
    } catch (e: any) {
        console.error("Attendance Error:", e.response?.data || e.message);
    }
}
test();
