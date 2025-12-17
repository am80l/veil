# Framework Integrations

Examples of integrating Veil with popular LLM frameworks.

## OpenAI Function Calling

```typescript
import OpenAI from 'openai';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);
const openai = new OpenAI();

// Define your tools
const tools = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } }
    }
  }
];

// Handle tool calls with Veil protection
async function handleToolCall(name: string, args: any) {
  if (name === 'read_file') {
    const check = veil.checkFile(args.path);
    if (!check.ok) return { error: check.reason };
    return { content: fs.readFileSync(args.path, 'utf-8') };
  }
}
```

## Anthropic Claude Tool Use

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);
const anthropic = new Anthropic();

// Process tool use blocks with Veil protection
function processToolUse(toolName: string, toolInput: any) {
  if (toolName === 'read_file') {
    const check = veil.checkFile(toolInput.path);
    if (!check.ok) {
      return { type: 'error', error: check.reason };
    }
    return { type: 'success', content: fs.readFileSync(toolInput.path, 'utf-8') };
  }
  
  if (toolName === 'run_command') {
    const check = veil.checkCommand(toolInput.command);
    if (!check.ok) {
      return { type: 'error', error: check.reason };
    }
    return { type: 'success', output: execSync(check.command).toString() };
  }
}
```

## LangChain Tools

```typescript
import { DynamicTool } from 'langchain/tools';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);

// Create a Veil-protected file reading tool
const readFileTool = new DynamicTool({
  name: 'read_file',
  description: 'Read contents of a file',
  func: async (path: string) => {
    const check = veil.checkFile(path);
    if (!check.ok) {
      return `Cannot read file: ${check.reason}`;
    }
    return fs.readFileSync(path, 'utf-8');
  },
});

// Create a Veil-protected command execution tool
const runCommandTool = new DynamicTool({
  name: 'run_command',
  description: 'Execute a shell command',
  func: async (command: string) => {
    const check = veil.checkCommand(command);
    if (!check.ok) {
      return `Command blocked: ${check.reason}`;
    }
    return execSync(check.command).toString();
  },
});
```

## Vercel AI SDK

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);

const readFileTool = tool({
  description: 'Read a file from the filesystem',
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    const check = veil.checkFile(path);
    if (!check.ok) {
      return { error: check.reason };
    }
    return { content: fs.readFileSync(path, 'utf-8') };
  },
});
```
