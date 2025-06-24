// Chainlink Functions - Extremely Simple Handler
// Only returns a 32-byte buffer with last byte set to 1 (success)

function handler(request) {
  // Create a 32-byte buffer
  const buffer = Buffer.alloc(32, 0);
  // Set the last byte to 1 (success)
  buffer[31] = 1;
  // Return the buffer directly
  return buffer;
}

module.exports = handler; 