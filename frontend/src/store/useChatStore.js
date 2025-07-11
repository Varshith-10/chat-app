import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
      console.log(res.status);
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isMessagesLoading: false });
    }
  },
  sendMessage: async ({ text, image }) => {
    const tempId = Date.now().toString();
    const authUser = useAuthStore.getState().authUser;
    const selectedUser = get().selectedUser;

    const newMessage = {
      _id: tempId,
      text,
      image,
      senderId: authUser._id,
      receiverId: selectedUser._id,
      status: "sending",
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      messages: [...state.messages, newMessage],
    }));

    try {
      const res = await axiosInstance.post(
        `/messages/send/${selectedUser._id}`,
        {
          text,
          image,
          tempId,
        }
      );

      const confirmedMessage = {
        ...res.data,
        status: "sent",
      };

      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === confirmedMessage.tempId ? confirmedMessage : msg
        ),
      }));
    } catch (error) {
      // ✅ Update message status to failed if error happens
      set((state) => ({
        messages: state.messages.map((msg) =>
          msg._id === tempId ? { ...msg, status: "failed" } : msg
        ),
      }));
      console.log(error("Message failed to send. Please check your internet."));
    }
  },
  retryUnsentMessages: async () => {
    const { messages, selectedUser } = get();
    if (!selectedUser) return;

    const authUser = useAuthStore.getState().authUser;
    if (!authUser) return;

    const unsentMessages = messages.filter(
      (msg) => msg.status === "failed" || msg.status === "sending"
    );

    for (const unsent of unsentMessages) {
      try {
        const res = await axiosInstance.post(
          `/messages/send/${selectedUser._id}`,
          {
            text: unsent.text,
            image: unsent.image,
            tempId: unsent._id, // keep same tempId to match
          }
        );

        const confirmedMessage = {
          ...res.data,
          status: "sent",
        };

        set((state) => ({
          messages: state.messages.map((msg) =>
            msg._id === confirmedMessage.tempId ? confirmedMessage : msg
          ),
        }));
      } catch (error) {
        console.error("Retry failed for message:", unsent._id);
      }
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;

    socket.on("newMessage", (newMessage) => {
      const isMessageSentFromSelectedUser =
        newMessage.senderId === selectedUser._id;
      if (!isMessageSentFromSelectedUser) return;

      set({
        messages: [...get().messages, newMessage],
      });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    useChatStore.getState().retryUnsentMessages();
  });
}
