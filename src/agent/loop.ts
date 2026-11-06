import type {
  AssistantMessage,
  Message,
  Provider,
  Tool,
  ToolCallBlock,
} from "../types.ts";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; call: ToolCallBlock }
  | { type: "tool_end"; call: ToolCallBlock; result: string; isError: boolean }
  | { type: "turn_end"; message: AssistantMessage }
  | { type: "message"; message: Message };

export type AgentOptions = {
  provider: Provider;
  model: string;
  system?: string;
  tools: Tool[];
  messages: Message[];
  maxTurns?: number;
  onEvent: (event: AgentEvent) => void;
};

export async function runAgent(opts: AgentOptions): Promise<void> {
  const { provider, model, system, tools, messages, onEvent } = opts;
  const maxTurns = opts.maxTurns ?? 10;
  const push = (message: Message) => {
    messages.push(message);
    onEvent({ type: "message", message });
  };
  
  for(let turn=1; turn<=maxTurns; ++turn){
        let assistant:AssistantMessage|undefined
        let toolCallRetries = 0;

        let contextMessages = messages;
        if (messages.length > 20) {
            const firstUserMsg = messages.find(m => m.role === "user");
            const recent = messages.slice(-19);

            if (firstUserMsg) {
                const recentWithoutFirst = recent.filter(m => m !== firstUserMsg);
                contextMessages = [firstUserMsg, ...recentWithoutFirst];
            } else {
                contextMessages = recent;
            }
        }

        try {
            for await(const event of provider.stream({messages: contextMessages, model, system, tools})){
                if(event.type==="text_delta") onEvent({type:"text", delta:event.delta})
                else assistant = event.message
            }
        } catch (e: any) {
            const isRateLimit = e instanceof Error && (e.message.includes("413") || e.message.includes("rate_limit"));
            const isToolFailure = e?.error?.code === "tool_use_failed" || e?.message?.includes("tool call validation failed");
            
            console.error(`[Agent Error] Turn ${turn} failed:`, e);
            
            if (isRateLimit) {
                console.log("[System] Rate limit hit. Waiting 5 seconds before retry...");
                await new Promise(resolve => setTimeout(resolve, 5000));
                turn--; 
                continue;
            }

            if (isToolFailure && toolCallRetries < 2) {
                console.log(`[System] Tool validation failed. Retrying turn ${turn} (attempt ${toolCallRetries + 1}/2)...`);
                toolCallRetries++;
                turn--; 
                continue;
            }
            
            onEvent({ type: "message", message: { role: "user", content: `Error: ${e instanceof Error ? e.message : String(e)}` } });
            continue;
        }
        if(!assistant) continue;
        push(assistant);
        onEvent({type:"turn_end",message:assistant})

        if(assistant.stopReason!=="toolUse") return;

        for(const call of assistant.content){
            if(call.type!== "toolCall") continue;
            onEvent({type:"tool_start",call});
            let result:string;
            let isError=false;

            try {
                const tool=tools.find((t)=>t.name===call.name);
                if(!tool) throw new Error(`unknown tool name ${call.name}`)
                result = await tool.execute(call.arguments)
                if (result.length > 4000) {
                    result = result.substring(0, 4000) + "\n... [truncated to fit token limits]";
                }
            } catch (e) {
                result=`Error ${e instanceof Error?e.message:String(e)}`
                isError=true
            }
            onEvent({type:"tool_end",call,result,isError})
            push({role:"toolResult",toolCallId:call.id,toolName:call.name, content:result, isError})
        }
  }
}