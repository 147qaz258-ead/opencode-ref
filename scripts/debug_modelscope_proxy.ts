
// Clear proxy environment variables to force direct connection
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

console.log("Proxy environment variables cleared.");

const API_KEY = "ms-e7357050-c02d-4fa1-b262-5918f07d6461";
const MODEL = "Qwen/Qwen-Image-2512";
const API_BASE = "https://api-inference.modelscope.cn";

async function run() {
  console.log(`Starting ModelScope debug with Model: ${MODEL}`);
  
  const controller = new AbortController();
  // 5 minutes timeout
  const timeoutId = setTimeout(() => controller.abort(), 300000);

  try {
    // 1. Submit
    console.log("Submitting task...");
    const submitResponse = await fetch(`${API_BASE}/v1/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
        "X-ModelScope-Async-Mode": "true",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt: "A futuristic city with flying cars, cyberpunk style",
        n: 1,
        size: "1024x1024"
      }),
      signal: controller.signal,
    });

    if (!submitResponse.ok) {
      const text = await submitResponse.text();
      throw new Error(`Submit failed ${submitResponse.status}: ${text}`);
    }

    const submitData = await submitResponse.json();
    const taskId = submitData.task_id || submitData.request_id;
    console.log(`Task submitted. ID: ${taskId}`);

    if (!taskId) throw new Error("No task ID returned");

    // 2. Poll
    // Wait initial 3s
    await new Promise(r => setTimeout(r, 3000));
    
    // Poll every 2s for up to the timeout
    while (!controller.signal.aborted) {
      console.log(`Polling task ${taskId}...`);
      const pollResponse = await fetch(`${API_BASE}/v1/tasks/${taskId}`, {
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "X-ModelScope-Task-Type": "image_generation",
        },
        signal: controller.signal,
      });

      if (!pollResponse.ok) {
        console.warn(`Poll request failed: ${pollResponse.status} ${pollResponse.statusText}`);
        // Continue polling unless 401/403 maybe?
        if (pollResponse.status === 401) throw new Error("Unauthorized during poll");
      } else {
        const taskData = await pollResponse.json();
        const status = taskData.task_status || taskData.status;
        console.log(`Task Status: ${status}`);

        if (status === "SUCCEEDED" || status === "SUCCESS") {
           console.log("Task SUCCEEDED!");
           const results = taskData.results || taskData.output?.results;
           const imageUrl = results?.[0]?.url || taskData.output?.url;
           console.log(`Image URL: ${imageUrl}`);
           return;
        }

        if (status === "FAILED") {
          console.error("Task FAILED:", taskData);
          throw new Error("Task Status is FAILED");
        }
      }

      await new Promise(r => setTimeout(r, 2000));
    }

  } catch (error) {
    if (controller.signal.aborted) {
      console.error("Operation Timed Out (5 minutes)");
    } else {
      console.error("Error:", error);
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

run();
