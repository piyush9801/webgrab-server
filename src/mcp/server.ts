#!/usr/bin/env node

/**
 * WebGrab MCP Server
 *
 * Exposes WebGrab backend functionality as MCP tools so AI assistants
 * like Claude Desktop and Cursor can programmatically import websites
 * into Figma as editable designs.
 *
 * Tools exposed:
 *   - import_url: Capture a live website URL and convert it to Figma nodes
 *   - import_html: Convert raw HTML/CSS code to Figma nodes
 *   - list_viewports: List available viewport presets
 *   - get_server_status: Health-check the WebGrab backend
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BACKEND_URL =
  process.env.WEBGRAB_SERVER_URL?.replace(/\/+$/, '') ||
  'http://localhost:3500';

const VIEWPORT_PRESETS: Record<
  string,
  { width: number; height: number; label: string }
> = {
  desktop: { width: 1440, height: 900, label: 'Desktop (1440 x 900)' },
  tablet: { width: 768, height: 1024, label: 'Tablet (768 x 1024)' },
  mobile: { width: 375, height: 812, label: 'Mobile (375 x 812)' },
};

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'import_url',
    description:
      'Import a website URL into Figma as editable designs. ' +
      'Captures the live page at the given URL, extracts the DOM tree and ' +
      'computed styles, and converts them into a Figma-compatible node tree.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'The website URL to import (must start with http:// or https://)',
        },
        viewport: {
          type: 'string',
          enum: ['desktop', 'tablet', 'mobile'],
          description:
            'Viewport preset to use when capturing the page. Defaults to "desktop".',
        },
        customWidth: {
          type: 'number',
          description:
            'Custom viewport width in pixels. Overrides the preset width when provided.',
        },
        customHeight: {
          type: 'number',
          description:
            'Custom viewport height in pixels. Overrides the preset height when provided.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'import_html',
    description:
      'Import raw HTML and CSS code into Figma as editable designs. ' +
      'Parses the provided markup, applies styles, and converts the result ' +
      'into a Figma-compatible node tree.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        html: {
          type: 'string',
          description: 'The HTML code to import.',
        },
        css: {
          type: 'string',
          description:
            'Optional CSS code to apply to the HTML before conversion.',
        },
      },
      required: ['html'],
    },
  },
  {
    name: 'list_viewports',
    description:
      'List available viewport presets for importing websites. ' +
      'Returns the name, width, and height of each supported viewport.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_server_status',
    description:
      'Check if the WebGrab backend server is running and healthy. ' +
      'Returns the current server status, version, and uptime information.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handler helpers
// ---------------------------------------------------------------------------

async function handleImportUrl(args: Record<string, unknown>): Promise<string> {
  const url = args.url as string;
  if (!url) {
    throw new Error('The "url" parameter is required.');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error(
      `Invalid URL: "${url}". Please provide a full URL starting with http:// or https://.`
    );
  }

  // Resolve viewport dimensions
  const viewportName = (args.viewport as string) || 'desktop';
  const preset = VIEWPORT_PRESETS[viewportName];
  if (!preset && !args.customWidth) {
    throw new Error(
      `Unknown viewport "${viewportName}". Valid options: ${Object.keys(VIEWPORT_PRESETS).join(', ')}.`
    );
  }

  const width =
    typeof args.customWidth === 'number'
      ? args.customWidth
      : preset?.width ?? 1440;
  const height =
    typeof args.customHeight === 'number'
      ? args.customHeight
      : preset?.height ?? 900;

  const body = {
    url,
    viewport: { width, height },
  };

  const response = await fetch(`${BACKEND_URL}/api/capture-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Backend returned HTTP ${response.status} for capture-url: ${errorText}`
    );
  }

  const data = await response.json();
  return JSON.stringify(data, null, 2);
}

async function handleImportHtml(args: Record<string, unknown>): Promise<string> {
  const html = args.html as string;
  if (!html) {
    throw new Error('The "html" parameter is required.');
  }

  const body: Record<string, string> = { html };
  if (typeof args.css === 'string' && args.css.length > 0) {
    body.css = args.css;
  }

  const response = await fetch(`${BACKEND_URL}/api/parse-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(
      `Backend returned HTTP ${response.status} for parse-html: ${errorText}`
    );
  }

  const data = await response.json();
  return JSON.stringify(data, null, 2);
}

function handleListViewports(): string {
  const presets = Object.entries(VIEWPORT_PRESETS).map(
    ([name, { width, height, label }]) => ({
      name,
      label,
      width,
      height,
    })
  );

  return JSON.stringify({ viewports: presets }, null, 2);
}

async function handleGetServerStatus(): Promise<string> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return JSON.stringify(
        {
          status: 'error',
          message: `Backend responded with HTTP ${response.status}`,
          backendUrl: BACKEND_URL,
        },
        null,
        2
      );
    }

    const data = await response.json();
    return JSON.stringify(
      {
        status: 'healthy',
        backendUrl: BACKEND_URL,
        ...data,
      },
      null,
      2
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown connection error';
    return JSON.stringify(
      {
        status: 'unreachable',
        message: `Could not connect to WebGrab backend at ${BACKEND_URL}: ${message}`,
        backendUrl: BACKEND_URL,
        hint: 'Make sure the WebGrab server is running (npm run dev in the server directory).',
      },
      null,
      2
    );
  }
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: 'webgrab-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- List tools -----------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// --- Call tool -------------------------------------------------------------

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: CallToolRequest) => {
    const { name, arguments: args = {} } = request.params;

    try {
      let resultText: string;

      switch (name) {
        case 'import_url':
          resultText = await handleImportUrl(args);
          break;

        case 'import_html':
          resultText = await handleImportHtml(args);
          break;

        case 'list_viewports':
          resultText = handleListViewports();
          break;

        case 'get_server_status':
          resultText = await handleGetServerStatus();
          break;

        default:
          return {
            content: [
              {
                type: 'text' as const,
                text: `Unknown tool: "${name}". Available tools: ${TOOLS.map((t) => t.name).join(', ')}`,
              },
            ],
            isError: true,
          };
      }

      return {
        content: [{ type: 'text' as const, text: resultText }],
      };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

// ---------------------------------------------------------------------------
// Start the server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so it does not interfere with the JSON-RPC stdio transport
  console.error('WebGrab MCP server started');
  console.error(`Backend URL: ${BACKEND_URL}`);
}

main().catch((err) => {
  console.error('Fatal: failed to start WebGrab MCP server', err);
  process.exit(1);
});
