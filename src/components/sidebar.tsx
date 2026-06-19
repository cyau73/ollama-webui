//components/sidebar.tsx
"use client";

import Link from "next/link";
import { MoreHorizontal, SquarePen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Message } from "ai/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import SidebarSkeleton from "./sidebar-skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import UserSettings from "./user-settings";
import { useLocalStorageData } from "@/app/hooks/useLocalStorageData";
import { ScrollArea, Scrollbar } from "@radix-ui/react-scroll-area";
import PullModel from "./pull-model";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { TrashIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";

interface SidebarProps {
  isCollapsed: boolean;
  messages: Message[];
  onClick?: () => void;
  isMobile: boolean;
  chatId: string;
  setMessages: (messages: Message[]) => void;
  closeSidebar?: () => void;
}

export function Sidebar({
  // messages, not needed here, but kept for future use if needed
  isCollapsed,
  isMobile,
  chatId,
  setMessages,
  closeSidebar
}: SidebarProps) {
  const [localChats, setLocalChats] = useState<
    { chatId: string; messages: Message[] }[]
  >([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (chatId) {
      setSelectedChatId(chatId);
    }

    setLocalChats(getLocalstorageChats());
    const handleStorageChange = () => {
      setLocalChats(getLocalstorageChats());
    };
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [chatId]); // Added chatId dependency to update highlights on route change

  const getLocalstorageChats = (): {
    chatId: string;
    messages: Message[];
  }[] => {
    if (typeof window === "undefined") return [];

    // ✅ FIX 1: Filter out known non-chat settings keys instead of filtering for "chat_"
    const chatKeys = Object.keys(localStorage).filter(
      (key) => key !== "selectedModel" && key !== "ollama_user"
    );

    if (chatKeys.length === 0) {
      setIsLoading(false);
      return [];
    }

    const chatObjects = chatKeys.map((key) => {
      const item = localStorage.getItem(key);
      try {
        return item
          ? { chatId: key, messages: JSON.parse(item) }
          : { chatId: key, messages: [] };
      } catch (e) {
        return { chatId: key, messages: [] };
      }
    });

    // Sort chats safely by checking if messages and dates exist
    chatObjects.sort((a, b) => {
      const aTime = a.messages?.[0]?.createdAt ? new Date(a.messages[0].createdAt).getTime() : 0;
      const bTime = b.messages?.[0]?.createdAt ? new Date(b.messages[0].createdAt).getTime() : 0;
      return bTime - aTime;
    });

    setIsLoading(false);
    return chatObjects;
  };

  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

  const handleDeleteChat = (targetId: string) => {
    localStorage.removeItem(targetId);
    setLocalChats(getLocalstorageChats());
    setDeletingChatId(null);
    // If we deleted the active chat, redirect back to root landing view
    if (targetId === selectedChatId) {
      setMessages([]);
      router.push("/");
    }
  };

  return (
    <div
      data-collapsed={isCollapsed}
      className="relative justify-between group lg:bg-accent/20 lg:dark:bg-card/35 flex flex-col h-full gap-4 p-2 data-[collapsed=true]:p-2 "
    >
      <div className="flex flex-col justify-between p-2 max-h-fit overflow-y-auto">
        <Button
          onClick={() => {
            router.push("/");
            setMessages([]);
            if (closeSidebar) {
              closeSidebar();
            }
          }}
          variant="ghost"
          className="flex justify-between w-full h-14 text-sm xl:text-lg font-normal items-center "
        >
          <div className="flex gap-3 items-center ">
            {!isCollapsed && !isMobile && (
              <Image
                src="/ollama.png"
                alt="AI"
                width={28}
                height={28}
                className="dark:invert hidden 2xl:block"
              />
            )}
            New chat
          </div>
          <SquarePen size={18} className="shrink-0 w-4 h-4" />
        </Button>

        <div className="flex flex-col pt-10 gap-2">
          <p className="pl-4 text-xs text-muted-foreground">Your chats</p>
          {localChats.length > 0 && (
            <div className="flex flex-col gap-1">
              {localChats.map(({ chatId: id, messages: chatMsgs }, index) => (
                <Link
                  key={id}
                  href={`/${id}`} // ✅ FIX 2: Using raw ID directly, no .substr(5)
                  className={cn(
                    {
                      [buttonVariants({ variant: "secondaryLink" })]:
                        id === selectedChatId, // ✅ FIX 3: Clean comparison without substring offsets
                      [buttonVariants({ variant: "ghost" })]:
                        id !== selectedChatId,
                    },
                    "flex justify-between w-full h-14 text-base font-normal items-center px-4"
                  )}
                >
                  <div className="flex gap-3 items-center truncate max-w-[75%]">
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-normal truncate">
                        {chatMsgs.length > 0 ? chatMsgs[0].content : "Empty Chat"}
                      </span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 flex justify-end items-center"
                        onClick={(e) => e.preventDefault()} // Stops Link navigation on open
                      >
                        <MoreHorizontal size={15} className="shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Dialog
                        open={deletingChatId === id}
                        onOpenChange={(isOpen) => setDeletingChatId(isOpen ? id : null)}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            className="w-full flex gap-2 hover:text-red-500 text-red-500 justify-start items-center"
                            onClick={(e) => { e.stopPropagation(); setDeletingChatId(id); }}
                          >
                            <Trash2 className="shrink-0 w-4 h-4" />
                            Delete chat
                          </Button>
                        </DialogTrigger>
                        <DialogContent onClick={(e) => e.stopPropagation()}>
                          <DialogHeader className="space-y-4">
                            <DialogTitle>Delete chat?</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to delete this chat? This
                              action cannot be undone.
                            </DialogDescription>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" onClick={() => setDeletingChatId(null)}>Cancel</Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleDeleteChat(id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </DialogHeader>
                        </DialogContent>
                      </Dialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Link>
              ))}
            </div>
          )}
          {isLoading && <SidebarSkeleton />}
        </div>
      </div>

      <div className="justify-end px-2 py-2 w-full border-t">
        <UserSettings />
      </div>
    </div>
  );
}