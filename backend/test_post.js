const axios = require('axios');

async function testPost() {
    try {
        const payload = {
            name: "Test Mentor Error",
            role: "usthad",
            phone: "1234567890",
            address: "Test Address",
            place: "Test Place",
            photo_url: null,
            phone_contacts: [{ number: "1234567890", relation: "Personal" }],
            join_year: "2024",
            join_month: "04"
        };
        
        console.log("Sending payload:", payload);
        const res = await axios.post(`http://localhost:5000/api/staff`, payload);
        console.log("Success:", res.data);
    } catch (err) {
        if (err.response) {
            console.error("Server Error Response:", err.response.data);
        } else {
            console.error("Error:", err.message);
        }
    }
}

testPost();
