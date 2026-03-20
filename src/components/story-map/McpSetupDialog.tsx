'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appOrigin: string;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs leading-5 whitespace-pre-wrap">
      <code>{code}</code>
    </pre>
  );
}

function SetupSection({ title, description, code }: { title: string; description: string; code: string }) {
  return (
    <div className="space-y-2 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <CodeBlock code={code} />
    </div>
  );
}

function InteractiveSetupSection({ mcpUrl }: { mcpUrl: string }) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">Interactive setup</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Use OpenCode&apos;s guided MCP setup if you&apos;d rather answer prompts than edit `opencode.json` by hand.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. Run interactive setup</p>
        <CodeBlock code={`opencode mcp add`} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">2. Answer the prompts</p>
        <CodeBlock
          code={`MCP server name:
beemspec

Select MCP server type:
Remote

MCP server URL:
${mcpUrl}

Does this server require OAuth authentication?:
Yes

Do you have a pre-registered client ID?:
No`}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">3. Authenticate</p>
        <CodeBlock code={`opencode mcp auth beemspec`} />
      </div>
    </div>
  );
}

function ManualSetupSection({ mcpUrl }: { mcpUrl: string }) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">Manual setup</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Edit `opencode.json` yourself if you want an explicit project-scoped or global MCP config.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. Add project config</p>
        <CodeBlock
          code={`{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "beemspec": {
      "type": "remote",
      "url": "${mcpUrl}",
      "oauth": {}
    }
  }
}`}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">2. Trigger auth</p>
        <CodeBlock code={`opencode mcp auth beemspec`} />
      </div>
    </div>
  );
}

function ClaudeSetupSection({ title, description, command }: { title: string; description: string; command: string }) {
  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">1. Add MCP server</p>
        <CodeBlock code={command} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">2. Authenticate</p>
        <CodeBlock code={`/mcp`} />
      </div>
    </div>
  );
}

export function McpSetupDialog({ open, onOpenChange, appOrigin }: Props) {
  const mcpUrl = appOrigin ? `${appOrigin}/api/mcp` : 'https://beemspec.com/api/mcp';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Connect BeemSpec MCP</DialogTitle>
          <DialogDescription>Use BeemSpec as a remote MCP server in OpenCode, Claude Code, or Codex.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="opencode" className="gap-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="opencode">OpenCode</TabsTrigger>
            <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
          </TabsList>

          <TabsContent value="opencode" className="space-y-4">
            <InteractiveSetupSection mcpUrl={mcpUrl} />
            <ManualSetupSection mcpUrl={mcpUrl} />
          </TabsContent>

          <TabsContent value="claude-code" className="space-y-4">
            <ClaudeSetupSection
              title="Project setup"
              description="Add BeemSpec to a repo&apos;s shared `.mcp.json` so the whole project can use the same MCP server config."
              command={`claude mcp add --transport http --scope project beemspec ${mcpUrl}`}
            />
            <ClaudeSetupSection
              title="Global setup"
              description="Add BeemSpec to your user-level Claude Code config so it&apos;s available across all projects on your machine."
              command={`claude mcp add --transport http --scope user beemspec ${mcpUrl}`}
            />
          </TabsContent>

          <TabsContent value="codex" className="space-y-4">
            <SetupSection
              title="`.codex/config.toml`"
              description="Add this to your project-scoped `.codex/config.toml` or user config, then run `codex mcp login beemspec`."
              code={`[mcp_servers.beemspec]
url = "${mcpUrl}"`}
            />
            <SetupSection
              title="Trigger auth"
              description="Run this after saving the config if you want to start the OAuth login flow right away."
              code={`codex mcp login beemspec`}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
