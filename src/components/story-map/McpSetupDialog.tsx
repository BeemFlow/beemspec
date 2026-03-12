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
            <SetupSection
              title="Project config"
              description="Add this to `opencode.json` in your project root, then let OpenCode complete OAuth when it first connects."
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
            <SetupSection
              title="Trigger auth"
              description="Run this after adding the config if you want to force the OAuth flow immediately."
              code={`opencode mcp auth beemspec`}
            />
          </TabsContent>

          <TabsContent value="claude-code" className="space-y-4">
            <SetupSection
              title="Add project-scoped HTTP MCP"
              description="Run this from your repo. Then use `/mcp` inside Claude Code to authenticate if prompted."
              code={`claude mcp add --transport http --scope project beemspec ${mcpUrl}`}
            />
            <SetupSection
              title="Trigger auth"
              description="Inside Claude Code, open the MCP manager and complete the login flow for BeemSpec."
              code={`/mcp`}
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
