"use client";

import { ChatLayout } from "@/components/chat/chat-layout";
import { getSelectedModel } from "@/lib/model-helper";
import { ChatOllama } from "@langchain/community/chat_models/ollama";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BytesOutputParser } from "@langchain/core/output_parsers";
import { Attachment, ChatRequestOptions } from "ai";
import { Message, useChat } from "ai/react";
import React, { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useChatStore from "../hooks/useChatStore";

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
    initialMessages: [], // ✅ Production Safe: Start empty to avoid SSR hydration mismatch
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
  const [ollama, setOllama] = useState<ChatOllama>();
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const base64Images = useChatStore((state) => state.base64Images);
  const setBase64Images = useChatStore((state) => state.setBase64Images);

  const env = process.env.NODE_ENV;

  // 1. Safe Client-Side Initialization
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Hydrate selected model safely
      setSelectedModel(getSelectedModel());

      // Hydrate initial chat logs safely on mount
      const item = localStorage.getItem(activeId);
      if (item) {
        try {
          setMessages(JSON.parse(item));
        } catch (e) {
          console.error("Failed to parse chat data:", e);
        }
      }
    }
  }, [activeId, setMessages]);

  // 2. Initialize Ollama instance for production mode
  useEffect(() => {
    if (env === "production" && selectedModel !== "REST API") {
      const newOllama = new ChatOllama({
        baseUrl: process.env.NEXT_PUBLIC_OLLAMA_URL || "http://localhost:11434",
        model: selectedModel,
      });
      setOllama(newOllama);
    }
  }, [selectedModel, env]);

  // 3. Consolidated Sync Saver Effect
  // Handles saving standard updates & REST API mutations without step-fighting your local stream handler
  useEffect(() => {
    if (!activeId || isLoading || error || messages.length === 0) return;

    // Guard against writing intermediate states while local LangChain stream is running
    if (env === "production" && selectedModel !== "REST API" && loadingSubmit) return;

    localStorage.setItem(activeId, JSON.stringify(messages));
    window.dispatchEvent(new Event("storage"));
  }, [messages, isLoading, error, activeId, env, selectedModel, loadingSubmit]);

  // 4. Stream Loop Handler
  const handleSubmitProduction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || !ollama) return;

    const userMessage: Message = { role: "user", content: input, id: uuidv4() };
    setInput("");

    const updatedMessages = [...messages, userMessage];
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

          // ✅ Explicitly declare the new item as a strict Vercel SDK Message type
          const newAssistantMessage: Message = {
            role: "assistant",
            content: responseMessage,
            id: assistantMessageId,
          };

          const nextHistory = [...filtered, newAssistantMessage];

          localStorage.setItem(activeId, JSON.stringify(nextHistory));
          return nextHistory;
        });
      }

      // Fire single layout signal at the very end of processing
      window.dispatchEvent(new Event("storage"));

    } catch (err) {
      console.error(err);
      toast.error("An error occurred. Please try again.");
      setLoadingSubmit(false);
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoadingSubmit(true);

    // setMessages([...messages]); removing this to prevent unnecessary state updates that can interfere with the production stream handler's timing

    const attachments: Attachment[] = base64Images
      ? base64Images.map((image) => ({
        contentType: 'image/base64', // Content type for base64 images
        url: image, // The base64 image data
      }))
      : [];

    // Prepare the options object with additional body data, to pass the model.
    const requestOptions: ChatRequestOptions = {
      options: {
        body: {
          selectedModel: selectedModel,
        },
      },
      ...(base64Images && {
        data: {
          images: base64Images,
        },
        experimental_attachments: attachments,
      }),
    };

    if (env === "production" && selectedModel !== "REST API") {
      handleSubmitProduction(e);
      setBase64Images(null);
    } else {
      // use the /api/chat route
      // Call the handleSubmit function with the options
      handleSubmit(e, requestOptions);
      setBase64Images(null);
    }
  };

  return (
    <main key={activeId} className="flex h-[calc(100dvh)] flex-col items-center">
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
    </main>
  );
}