"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import {
  Card,
  Button,
  Input,
  Text,
  Spinner,
  Subtitle1,
  Body1,
} from "@fluentui/react-components";
import { SendRegular } from "@fluentui/react-icons";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load application configuration");
        return response.json();
      })
      .then((config: { apiUrl: string }) => setApiUrl(config.apiUrl))
      .catch(() => setApiUrl("http://localhost:8000"));
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function createConversation(): Promise<string> {
    const response = await fetch(`${apiUrl}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Conversation" }),
    });
    if (!response.ok) {
      throw new Error("Failed to create conversation");
    }
    const data = await response.json();
    return data.id;
  }

  async function sendMessage(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      let currentConversationId = conversationId;
      if (!currentConversationId) {
        currentConversationId = await createConversation();
        setConversationId(currentConversationId);
      }

      const response = await fetch(
        `${apiUrl}/api/conversations/${currentConversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: "assistant",
        content: data.assistantMessage.content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content:
          error instanceof Error
            ? `Error: ${error.message}`
            : "An unexpected error occurred.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <Subtitle1 style={styles.headerTitle}>
          Agents Runtime – Chat
        </Subtitle1>
        <Text size={200} style={styles.headerSubtitle}>
          Azure AI Agents Runtime Demo with full observability
        </Text>
      </div>

      {/* Messages Area */}
      <div style={styles.messagesArea}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>
            <Text size={400} style={{ color: "#8a8a8a" }}>
              Send a message to start a conversation
            </Text>
          </div>
        )}
        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              ...styles.messageBubbleRow,
              justifyContent:
                msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <Card
              style={{
                ...(msg.role === "user"
                  ? styles.userBubble
                  : styles.assistantBubble),
              }}
            >
              <Body1
                style={{
                  color: msg.role === "user" ? "#ffffff" : "#242424",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {msg.content}
              </Body1>
              <Text
                size={100}
                style={{
                  color:
                    msg.role === "user"
                      ? "rgba(255,255,255,0.7)"
                      : "#8a8a8a",
                  marginTop: "4px",
                  display: "block",
                  textAlign: msg.role === "user" ? "right" : "left",
                }}
              >
                {formatTimestamp(msg.timestamp)}
              </Text>
            </Card>
          </div>
        ))}
        {loading && (
          <div style={styles.spinnerRow}>
            <Spinner size="tiny" label="Thinking..." />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} style={styles.inputArea}>
        <Input
          style={styles.input}
          placeholder="Type your message..."
          value={input}
          onChange={(_e, data) => setInput(data.value)}
          disabled={loading}
          size="large"
        />
        <Button
          appearance="primary"
          icon={<SendRegular />}
          type="submit"
          disabled={!input.trim() || loading}
          size="large"
          style={styles.sendButton}
        >
          Send
        </Button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#f5f5f5",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    padding: "16px 24px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e0e0e0",
  },
  headerTitle: {
    color: "#0078d4",
    fontWeight: 600,
  },
  headerSubtitle: {
    color: "#616161",
    marginTop: "2px",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  messageBubbleRow: {
    display: "flex",
    width: "100%",
  },
  userBubble: {
    maxWidth: "70%",
    backgroundColor: "#0078d4",
    borderRadius: "12px 12px 2px 12px",
    padding: "12px 16px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  assistantBubble: {
    maxWidth: "70%",
    backgroundColor: "#ffffff",
    borderRadius: "12px 12px 12px 2px",
    padding: "12px 16px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  spinnerRow: {
    display: "flex",
    justifyContent: "flex-start",
    padding: "8px 0",
  },
  inputArea: {
    display: "flex",
    gap: "8px",
    padding: "16px 24px",
    backgroundColor: "#ffffff",
    borderTop: "1px solid #e0e0e0",
  },
  input: {
    flex: 1,
  },
  sendButton: {
    minWidth: "100px",
  },
};
