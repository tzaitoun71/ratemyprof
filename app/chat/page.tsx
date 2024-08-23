"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  TextField,
  Button,
  List,
  ListItemText,
  Typography,
  ListItem,
  IconButton,
  Modal,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AddIcon from "@mui/icons-material/Add";
import ReactMarkdown from "react-markdown";
import { Line } from "react-chartjs-2";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

type ChatMessage = {
  user: string;
  bot: string;
};

type TrendMessage = ChatMessage & {
  trendData?: any;
};

// calculate the moving average
const calculateMovingAverage = (data: number[], period: number) => {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - period + 1);
    const subset = data.slice(start, i + 1);
    const average = subset.reduce((a, b) => a + b, 0) / subset.length;
    result.push(average);
  }
  return result;
};

const ChatPage = () => {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<TrendMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  const [url, setUrl] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false); // Add loading state

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedSessionId = localStorage.getItem("sessionId");
      setSessionId(storedSessionId);
    }
  }, []);

  const handleSendMessage = async () => {
    if (!message) return;

    const userMessage: ChatMessage = { user: message, bot: "" };
    setChatHistory([...chatHistory, userMessage]);
    setMessage("");
    setIsTyping(true);

    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question: message, sessionId }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const botMessageContent = data.response;
      const botMessage: ChatMessage = { user: message, bot: botMessageContent };

      if (data.ratings && data.ratings.length > 0) {
        const ratingsArray = data.ratings[0];

        const labels = ratingsArray.map((_: any, index: any) => index + 1);
        const values = ratingsArray.map((entry: any) => {
          const sentiment = entry.sentiment?.toLowerCase();
          if (sentiment === "positive") return 1;
          if (sentiment === "neutral") return 0;
          if (sentiment === "negative") return -1;
          return null;
        });

        const smoothedValues = calculateMovingAverage(values, 3); // 3-point moving average

        const trendData = {
          labels: labels,
          datasets: [
            {
              label: "Professor Ratings Over Time",
              data: smoothedValues,
              fill: false,
              backgroundColor: "#007bff",
              borderColor: "#007bff",
              borderWidth: 2,
              tension: 0.3, // Smoother lines
              pointRadius: 5,
              pointHoverRadius: 7,
            },
          ],
        };

        const trendBubble: TrendMessage = {
          user: "",
          bot: "Here is the trend line of ratings over time:",
          trendData: trendData,
        };

        setChatHistory((prevChat) => [...prevChat, trendBubble]);
      } else {
        setChatHistory((prevChat) => [...prevChat, botMessage]);
      }

      setIsTyping(false);

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem("sessionId", data.sessionId);
      }

      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop =
          chatContainerRef.current.scrollHeight;
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setIsTyping(false);
    }
  };

  const handleUpload = async () => {
    setUploadMessage("");
    setIsLoading(true); // Start loading

    if (!url) {
      setUploadMessage("Please enter a URL.");
      setIsLoading(false); // Stop loading if there's an error
      return;
    }

    try {
      const response = await fetch("/api/upload-professor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (response.ok) {
        setUploadMessage("Professor data successfully uploaded.");
        setUrl("");  // Clear the input field after submission
      } else {
        const data = await response.json();
        setUploadMessage(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error uploading professor data:", error);
      setUploadMessage("Error uploading professor data.");
    } finally {
      setIsLoading(false); // Stop loading
    }
  };

  useEffect(() => {
    let typingInterval: NodeJS.Timeout;
    if (isTyping) {
      typingInterval = setInterval(() => {
        setTypingIndicator((prev) => (prev === "..." ? "" : prev + "."));
      }, 500);
    }

    return () => clearInterval(typingInterval);
  }, [isTyping]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      localStorage.removeItem("sessionId");
      setSessionId(null);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return (
    <Box
      sx={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "rgb(var(--background-start-rgb))",
      }}
    >
      <Box
        sx={{
          width: "80vw",
          height: "80vh",
          backgroundColor: "white",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          borderRadius: "15px",
          display: "flex",
          flexDirection: "column",
          padding: 3,
          boxSizing: "border-box",
        }}
      >
        <Typography
          variant="h4"
          align="center"
          gutterBottom
          sx={{ fontWeight: "bold", color: "#333" }}
        >
          RateMyProfessor Assistant
        </Typography>
        <Box
          ref={chatContainerRef}
          sx={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            padding: 2,
            backgroundColor: "#ffffff",
            borderRadius: "10px",
            boxShadow: "inset 0 0 10px rgba(0, 0, 0, 0.1)",
            minHeight: "auto",
          }}
        >
          <List sx={{ flexGrow: 1 }}>
            {chatHistory.map((chatItem, index) => (
              <ListItem
                key={index}
                sx={{
                  display: "flex",
                  justifyContent: chatItem.bot ? "flex-start" : "flex-end",
                }}
              >
                <Box
                  component="div"
                  sx={{
                    backgroundColor: chatItem.bot ? "#d0e0fc" : "#007bff",
                    color: chatItem.bot ? "#333" : "#fff",
                    borderRadius: "15px",
                    padding: "10px 20px",
                    maxWidth: "60%",
                    textAlign: "left",
                    wordBreak: "break-word",
                    boxShadow: "0 2px 5px rgba(0, 0, 0, 0.1)",
                    transition: "transform 0.2s ease",
                    "&:hover": {
                      transform: "scale(1.02)",
                    },
                  }}
                >
                  {chatItem.bot ? (
                    chatItem.trendData ? (
                      <>
                        <Typography sx={{ fontSize: "16px" }}>
                          {chatItem.bot}
                        </Typography>
                        <Box
                          sx={{
                            width: "40vw",
                            height: "40vh",
                            marginTop: 2,
                            backgroundColor: "#fff",
                            borderRadius: "15px",
                            padding: "20px",
                          }}
                        >
                          <Line
                            data={chatItem.trendData}
                            options={{
                              plugins: {
                                legend: {
                                  labels: {
                                    font: {
                                      size: 12,
                                    },
                                  },
                                },
                              },
                            }}
                          />
                        </Box>
                      </>
                    ) : (
                      <ReactMarkdown>{chatItem.bot}</ReactMarkdown>
                    )
                  ) : (
                    <ListItemText primary={chatItem.user} />
                  )}
                </Box>
              </ListItem>
            ))}
            {isTyping && (
              <ListItem sx={{ display: "flex", justifyContent: "flex-start" }}>
                <Box
                  component="div"
                  sx={{
                    backgroundColor: "#d0e0fc",
                    borderRadius: "15px",
                    padding: "10px 20px",
                    maxWidth: "60%",
                    textAlign: "left",
                    wordBreak: "break-word",
                    boxShadow: "0 2px 5px rgba(0, 0, 0, 0.1)",
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ListItemText primary={typingIndicator || "..."} />
                </Box>
              </ListItem>
            )}
          </List>
        </Box>
        <Box
          sx={{
            display: "flex",
            marginTop: 2,
            padding: "0 8px",
            alignItems: "center",
            width: "100%",
          }}
        >
          <TextField
            label="Type your message"
            variant="outlined"
            fullWidth
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") handleSendMessage();
            }}
            sx={{
              marginRight: "12px",
              backgroundColor: "#ffffff",
              borderRadius: "8px",
            }}
          />
          <Tooltip title="Add Professor URL">
            <IconButton
              sx={{
                marginRight: "8px",
                backgroundColor: "#007bff",
                color: "#ffffff",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                "&:hover": {
                  backgroundColor: "#0056a3",
                },
                padding: "10px",
              }}
              onClick={() => setModalOpen(true)}
            >
              <AddIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            sx={{
              marginRight: "16px",
              backgroundColor: "#007bff",
              color: "#ffffff",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
              "&:hover": {
                backgroundColor: "#0056a3",
              },
              padding: "10px 16px",
              minWidth: "75px",
            }}
            onClick={handleSendMessage}
            endIcon={<SendIcon />}
          >
            Send
          </Button>
        </Box>
      </Box>

      {/* Modal for URL Upload */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: 24,
            p: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Typography id="modal-modal-title" variant="h6" component="h2">
            Upload Professor URL
          </Typography>
          <TextField
            label="Professor URL"
            variant="outlined"
            fullWidth
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            sx={{ marginBottom: 2 }}
            disabled={isLoading} // Disable input while loading
          />
          <Button
            variant="contained"
            fullWidth
            onClick={handleUpload}
            sx={{
              backgroundColor: "#007bff",
              color: "#ffffff",
              "&:hover": {
                backgroundColor: "#0056a3",
              },
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
            disabled={isLoading} // Disable button while loading
          >
            {isLoading ? (
              <CircularProgress size={24} sx={{ color: "#fff" }} />
            ) : (
              "Upload"
            )}
          </Button>
          {uploadMessage && (
            <Typography variant="body1" sx={{ marginTop: 2, color: "green" }}>
              {uploadMessage}
            </Typography>
          )}
        </Box>
      </Modal>
    </Box>
  );
};

export default ChatPage;
