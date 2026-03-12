import axios from 'axios';
import jwt from 'jsonwebtoken';

const token = jwt.sign({ id: 'test', role: 'admin' }, 'your_super_secret_jwt_key_here', { expiresIn: '1h' });

async function test() {
    try {
        console.log("Testing Academics Attendance Students...");
        const res1 = await axios.post("http://localhost:5000/api/academics/attendance/students", 
            { department: "School", standard: "All" },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        console.log("Academics Attendance Students Success:", res1.data);
    } catch (e: any) {
        console.error("Academics Attendance Students Error:", e.response?.data || e.message);
    }
}
test();
