//app/page.tsx
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
import { Attachment, ChatRequestOptions } from "ai";
import { Message, useChat } from "ai/react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useChatStore from "@/app/hooks/useChatStore";
import { useRouter } from "next/dist/client/components/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function Page({ params }: PageProps) {
  const router = useRouter();
  const unpackedParams = React.use(params);
  const activeId = React.useMemo(() => unpackedParams.id || uuidv4(), [unpackedParams.id]);
  const isHydrated = useRef(false); // Add this at the top of your component

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
    // Add the onFinish callback to save after every successful stream
    onFinish: (message) => {
      console.log("activeId:", activeId);
      console.log("isPendingNavigation:", isPendingNavigation);

      if (!activeId) return;
      const updatedHistory = [...messages, message];
      saveToLocalStorage(activeId, updatedHistory);
      window.dispatchEvent(new Event("storage"));

      if (isPendingNavigation.current) {
        isPendingNavigation.current = false;
        router.push(`/${activeId}`);
      }
    },
    onError: (error) => {
      setLoadingSubmit(false);
      console.error("Chat SDK Error:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast.error(`Chat error: ${message}`);
    },
  });

  const [selectedModel, setSelectedModel] = useState<string>("REST API");
  const [open, setOpen] = useState(false); // ✅ Restored initialization open state flag
  // const [ollama, setOllama] = useState<ChatOllama | undefined>(undefined);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const base64Images = useChatStore((state) => state.base64Images);
  const setBase64Images = useChatStore((state) => state.setBase64Images);
  const env = process.env.NODE_ENV;

  const isPendingNavigation = useRef(false);

  // Safe Client hydration for history log entries & settings
  useEffect(() => {
    console.log("Component Rendered. Messages length:", messages.length);
    console.log("Current activeId:", activeId);

    if (isHydrated.current || !activeId) return;

    if (typeof window !== "undefined" && activeId) {
      setSelectedModel(getSelectedModel());

      //Get localStorage item for active chat session and parse it safely
      const item = localStorage.getItem(activeId);
      if (item) {
        try {
          const parsed = JSON.parse(item);
          if (JSON.stringify(parsed) !== JSON.stringify(messages)) {
            setMessages(parsed);
          }
        } catch (e) {
          console.error("Failed to parse history logs:", e);
        }
      }

      // ✅ Restored: Verify profile parameters on deep-linked page initialization
      if (!localStorage.getItem("ollama_user")) {
        setOpen(true);
      }

      isHydrated.current = true; // Mark as hydrated after successfully loading messages
    }
  }, [activeId, setMessages]);

  // Add this helper to your page.tsx or a utility file
  const initializeChat = (id: string) => {
    if (!localStorage.getItem(id)) {
      localStorage.setItem(id, JSON.stringify([]));
    }
  };

  const saveToLocalStorage = (id: string, data: any) => {
    if (!id || id === 'undefined') {
      console.warn("Attempted to save with an invalid ID, skipping storage.");
      return;
    }
    try {
      localStorage.setItem(id, JSON.stringify(data));
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        console.error("Storage limit reached! You need to clear old chats.");
        toast.error("Storage full: Cannot save new messages.");
      } else {
        console.error("Failed to save to localStorage:", e);
      }
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!unpackedParams.id) {
      isPendingNavigation.current = true; // Flag that we need to move once done

      // 1. Save the first message to localStorage manually before moving
      const initialMsg: Message = {
        role: "user",
        content: input,
        id: uuidv4(),
        experimental_attachments: base64Images ? base64Images.map(url => ({ contentType: "image/base64", url })) : []
      };

      // 2. Persist to storage using the NEW activeId
      saveToLocalStorage(activeId, [initialMsg]);
    }

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

    handleSubmit(e, requestOptions);
    setBase64Images(null);
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
          defaultLayout={[20, 80]}
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