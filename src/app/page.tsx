"use client";

import { ChatLayout } from "@/components/chat/chat-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import UsernameForm from "@/components/username-form";
import { getSelectedModel } from "@/lib/model-helper";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BytesOutputParser } from "@langchain/core/output_parsers";
import { Attachment, ChatRequestOptions } from "ai";
import { Message, useChat } from "ai/react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useChatStore from "@/app/hooks/useChatStore";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function Page({ params }: PageProps) {
  const unpackedParams = React.use(params);
  const activeId = unpackedParams.id;

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
    setMessages,
    setInput,
  } = useChat({
    id: activeId,
    initialMessages: [],
    onResponse: (response) => {
      if (response) {
        setLoadingSubmit(false);
      }
    },
    onError: (error) => {
      setLoadingSubmit(false);
      toast.error("An error occurred. Please try again.");
    },
  });

  const [selectedModel, setSelectedModel] = useState<string>("REST API");
  const [open, setOpen] = useState(false); // ✅ Restored initialization open state flag
  const [ollama, setOllama] = useState<ChatOllama | undefined>(undefined);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const base64Images = useChatStore((state) => state.base64Images);
  const setBase64Images = useChatStore((state) => state.setBase64Images);
  const env = process.env.NODE_ENV;

  // Safe Client hydration for history log entries & settings
  useEffect(() => {
    if (typeof window !== "undefined") {
      setSelectedModel(getSelectedModel());

      //Get localStorage item for active chat session and parse it safely
      const item = localStorage.getItem(activeId);
      if (item) {
        try {
          setMessages(JSON.parse(item));
        } catch (e) {
          console.error("Failed to parse history logs:", e);
        }
      }

      // ✅ Restored: Verify profile parameters on deep-linked page initialization
      if (!localStorage.getItem("ollama_user")) {
        setOpen(true);
      }
    }
  }, [activeId, setMessages]);

  // Setup Ollama pipeline engine configuration
  useEffect(() => {
    if (env === "production" && selectedModel !== "REST API") {
      const newOllama = new ChatOllama({
        baseUrl: process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434",
        model: selectedModel,
      });
      setOllama(newOllama);
    }
  }, [selectedModel, env]);

  // Sync updates back to disk for non-production frameworks
  useEffect(() => {
    if (!activeId || isLoading || error || messages.length === 0) return;
    if (env === "production" && selectedModel !== "REST API" && loadingSubmit) return;

    localStorage.setItem(activeId, JSON.stringify(messages));
    window.dispatchEvent(new Event("storage"));
  }, [messages, isLoading, error, activeId, env, selectedModel, loadingSubmit]);

  const handleSubmitProduction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || !ollama) return;

    const userMsg: Message = { role: "user", content: input, id: uuidv4() };
    setInput("");

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      const parser = new BytesOutputParser();
      const stream = await ollama.pipe(parser).stream(
        updatedMessages.map((m) =>
          m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
        )
      );

      const decoder = new TextDecoder();
      let responseMessage = "";
      const assistantMessageId = uuidv4();

      setLoadingSubmit(false);

      for await (const chunk of stream) {
        const decodedChunk = decoder.decode(chunk, { stream: true });
        responseMessage += decodedChunk;

        setMessages((prevMessages) => {
          const filtered = prevMessages.filter((m) => m.id !== assistantMessageId);
          const nextHistory = [
            ...filtered,
            { role: "assistant" as const, content: responseMessage, id: assistantMessageId },
          ];

          localStorage.setItem(activeId, JSON.stringify(nextHistory));
          return nextHistory;
        });
      }

      window.dispatchEvent(new Event("storage"));

    } catch (err) {
      console.error(err);
      // 1. Convert the unknown error safely
      const standardError = err instanceof Error ? err : new Error("Ollama connection failed");

      // 2. Explicitly call your unified error configuration block manually
      // This allows you to maintain single-point error monitoring:
      setLoadingSubmit(false);
      toast.error("An error occurred. Please try again.");
      setLoadingSubmit(false);
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoadingSubmit(true);

    const attachments: Attachment[] = base64Images
      ? base64Images.map((image) => ({ contentType: "image/base64", url: image }))
      : [];

    const requestOptions: ChatRequestOptions = {
      options: { body: { selectedModel } },
      ...(base64Images && {
        data: { images: base64Images },
        experimental_attachments: attachments,
      }),
    };

    if (env === "production" && selectedModel !== "REST API") {
      handleSubmitProduction(e);
      setBase64Images(null);
    } else {
      handleSubmit(e, requestOptions);
      setBase64Images(null);
    }
  };

  const onOpenChange = (isOpen: boolean) => {
    const username = localStorage.getItem("ollama_user")
    if (username) return setOpen(isOpen)

    localStorage.setItem("ollama_user", "Anonymous");
    window.dispatchEvent(new Event("storage"));
    setOpen(isOpen);
  };

  return (
    <main className="flex h-[calc(100dvh)] flex-col items-center ">
      <Dialog open={open} onOpenChange={onOpenChange}>
        <ChatLayout
          chatId={activeId}
          setSelectedModel={setSelectedModel}
          messages={messages}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={onSubmit}
          isLoading={isLoading}
          loadingSubmit={loadingSubmit}
          error={error}
          stop={stop}
          navCollapsedSize={10}
          defaultLayout={[30, 160]}
          formRef={formRef as React.RefObject<HTMLFormElement>}
          setMessages={setMessages}
          setInput={setInput}
        />
        <DialogContent className="flex flex-col space-y-4">
          <DialogHeader className="space-y-2">
            <DialogTitle>Welcome to Ollama!</DialogTitle>
            <DialogDescription>
              Enter your name to get started. This is just to personalize your experience.
            </DialogDescription>
            <UsernameForm setOpen={setOpen} />
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </main>
  );
}