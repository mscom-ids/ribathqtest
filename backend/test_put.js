const axios = require('axios');

async function testPut() {
    try {
        // Needs a valid staff ID, any ID from the database
        // I'll first fetch staff to get an ID
        const getRes = await axios.get('http://localhost:5000/api/staff');
        const usthads = getRes.data.staff;
        if (!usthads || usthads.length === 0) {
            console.log("No staff found");
            return;
        }
        
        const staffId = usthads[0].id; // The UUID
        console.log("Testing PUT on:", staffId);
        
        const payload = {
            name: usthads[0].name,
            role: usthads[0].role,
            staff_id: usthads[0].staff_id || null, // Keeping it the same 
            phone: usthads[0].phone || null,
            address: usthads[0].address || null,
            place: usthads[0].place || null,
            photo_url: usthads[0].photo_url || null,
            phone_contacts: usthads[0].phone_contacts || [],
        };
        
        const res = await axios.put(`http://localhost:5000/api/staff/${staffId}`, payload);
        console.log("Success:", res.data);
    } catch (err) {
        if (err.response) {
            console.error("Server Error Response:", err.response.data);
        } else {
            console.error("Error:", err.message);
        }
    }
}

testPut();
