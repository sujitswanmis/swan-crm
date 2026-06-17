const { POST } = require('../src/app/api/plivo/incoming/route');

// Mock request object
const mockReq = {
  url: 'https://swan-hosting.vercel.app/api/plivo/incoming',
  text: async () => {
    // Simulate Plivo incoming webhook parameters
    // Customer From: +919999999999
    // Plivo To: +918035340622
    const params = new URLSearchParams({
      From: '+919999999999',
      To: '+918035340622',
      CallUUID: 'test-call-uuid-12345'
    });
    return params.toString();
  }
};

async function test() {
  try {
    const response = await POST(mockReq);
    const text = await response.text();
    console.log("Response status:", response.status);
    console.log("Response headers:", Object.fromEntries(response.headers.entries()));
    console.log("Response XML body:");
    console.log(text);
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
