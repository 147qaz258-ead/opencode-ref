#!/bin/bash
# E2E Test Verification Script
# This script tests all the fixes made for the E2E tests

echo "=== E2E Test Verification ==="
echo ""

BASE_URL="http://127.0.0.1:4096"
AUTH_TOKEN="user-e2e-test"

echo "1. Testing 404 for non-existent session (should return 404, not 400)..."
response=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer ${AUTH_TOKEN}" "${BASE_URL}/session/ses_nonexistent12345")
status=$(echo "$response" | tail -n1)
if [ "$status" = "404" ]; then
    echo "   ✓ PASS: Got 404 as expected"
else
    echo "   ✗ FAIL: Got $status instead of 404"
    echo "   Response: $response"
fi
echo ""

echo "2. Testing 401 without auth (should return 401 after server restart)..."
response=$(curl -s -w "\n%{http_code}" "${BASE_URL}/session/ses_test123")
status=$(echo "$response" | tail -n1)
if [ "$status" = "401" ]; then
    echo "   ✓ PASS: Got 401 as expected"
else
    echo "   ✗ FAIL: Got $status instead of 401 (Server needs restart for fix to take effect)"
fi
echo ""

echo "3. Testing message sending to non-existent session (should return 404, not 500)..."
response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -d '{"sessionID":"ses_nonexistent12345","content":"test","agent":"build","model":{"providerID":"anthropic","modelID":"claude-sonnet-4-5-20250929"}}' \
    "${BASE_URL}/message")
status=$(echo "$response" | tail -n1)
if [ "$status" = "404" ]; then
    echo "   ✓ PASS: Got 404 as expected"
else
    echo "   ✗ FAIL: Got $status instead of 404 (Server needs restart for fix to take effect)"
    echo "   Response: $response"
fi
echo ""

echo "4. Testing session creation..."
response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -d '{"title":"Test Session"}' \
    "${BASE_URL}/session")
status=$(echo "$response" | tail -n1)
if [ "$status" = "200" ]; then
    echo "   ✓ PASS: Session created successfully"
    session_id=$(echo "$response" | head -n-1 | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "   Session ID: $session_id"
    
    # Cleanup
    curl -s -X DELETE -H "Authorization: Bearer ${AUTH_TOKEN}" "${BASE_URL}/session/${session_id}" > /dev/null
else
    echo "   ✗ FAIL: Got $status instead of 200"
    echo "   Response: $response"
fi
echo ""

echo "=== Summary ==="
echo "Server restart required for authentication and session validation fixes to take effect."
echo "Frontend rebuild may be required for SSE logging fix."
