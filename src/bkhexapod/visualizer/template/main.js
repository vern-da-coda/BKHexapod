const statusElement = document.getElementById('status');
const canvas = document.getElementById('robotCanvas');
const ctx = canvas.getContext('2d');

const ws = new WebSocket("ws://localhost:8765");

let servo_angles = {}; // Object to store the latest angle for each servo channel

ws.onopen = () => {
    statusElement.textContent = "Connected";
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'servo_update') {
        // Update the angle for the specific servo channel
        servo_angles[data.channel] = data.angle;
        drawRobot(); // Redraw the robot with the new angle
    }
};

ws.onclose = () => {
    statusElement.textContent = "Disconnected";
};

ws.onerror = (error) => {
    console.error("WebSocket Error:", error);
    statusElement.textContent = "Error! See console for details.";
};

function drawRobot() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Simple placeholder visualization
    ctx.fillStyle = '#333';
    ctx.fillRect(350, 250, 100, 100); // Robot Body

    // Draw legs based on servo angles (highly simplified)
    for (let i = 0; i < 18; i++) {
        const angle = servo_angles[i] || 0; // Default to 0 if no angle received
        const x = 400 + 100 * Math.cos(angle * Math.PI / 180);
        const y = 300 + 100 * Math.sin(angle * Math.PI / 180);

        ctx.beginPath();
        ctx.moveTo(400, 300);
        ctx.lineTo(x, y);
        ctx.stroke();
    }
}

drawRobot(); // Initial draw
