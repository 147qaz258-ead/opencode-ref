import os
import asyncio
import logging
import sys
from browser_use import Agent
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic

# Configure debug logging
logging.basicConfig(stream=sys.stdout, level=logging.DEBUG)
logging.getLogger("browser_use").setLevel(logging.DEBUG)


# Check API Keys
openai_key = os.getenv("OPENAI_API_KEY")
anthropic_key = os.getenv("ANTHROPIC_API_KEY")

if not openai_key and not anthropic_key:
    # Try getting from process env if not in dotenv (Docker passed them)
    pass

class CompatibleChatOpenAI(ChatOpenAI):
    """Wrapper to add 'provider' attribute required by some browser-use versions"""
    # Allow extra fields (like 'ainvoke' which browser-use tries to set)
    model_config = {"extra": "allow"} 
    
    @property
    def provider(self):
        return "openai"

    @property
    def model(self):
        return self.model_name

# Initialize LLM
if openai_key:
    print("Using OpenAI...")
    llm = CompatibleChatOpenAI(model="gpt-4o", api_key=openai_key)
elif anthropic_key:
    print("Using Anthropic...")
    # Also wrap Anthropic if needed, but error was on OpenAI
    llm = ChatAnthropic(model="claude-3-opus-20240229", api_key=anthropic_key)
    if not hasattr(llm, "provider"):
        try:
            llm.provider = "anthropic"
        except:
            pass

from browser_use import Agent

async def main():
    print("Starting Browser Agent...")
    # Rely on browser-use default (auto-detects docker?)
    agent = Agent(
        task="Go to Google and search for 'OpenCode Agent' and print the first result title.",
        llm=llm,
    )
    result = await agent.run()
    print("Result:", result)

if __name__ == "__main__":
    asyncio.run(main())
