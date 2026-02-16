
import { Client } from "@gradio/client";

async function inspect() {
  console.log("Connecting to Lightricks/ltx-video-distilled...");
  try {
    const client = await Client.connect("Lightricks/ltx-video-distilled");
    const apiInfo = await client.view_api();
    console.log("API Info:", JSON.stringify(apiInfo, null, 2));
  } catch (error) {
    console.error("Error inspecting Gradio space:", error);
  }
}

inspect();
