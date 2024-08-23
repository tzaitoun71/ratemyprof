import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import { ChatOpenAI } from "@langchain/openai";
import { SelfQueryRetriever } from "langchain/retrievers/self_query";
import { PineconeTranslator } from "@langchain/pinecone";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid"; // Use uuid to create unique session IDs
import { prompt } from "../../utils/Prompt";
import { db } from "../../config/Firebase"; // Import Firebase Firestore
import { collection, query, where, getDocs } from "firebase/firestore";

interface ChatHistory {
  [key: string]: {
    history: Array<HumanMessage | AIMessage | SystemMessage>;
    currentProfessor?: string;
  };
}

const chatHistories: ChatHistory = {}; // Store chat history and professor name per session

const setupPineconeLangchain = async () => {
  const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY as string,
  });
  const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX as string);

  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY as string,
  });

  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
  });

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0.2,
    apiKey: process.env.OPENAI_API_KEY as string,
  });

  const selfQueryRetriever = SelfQueryRetriever.fromLLM({
    llm: llm,
    vectorStore: vectorStore,
    documentContents: "Document content",
    attributeInfo: [],
    structuredQueryTranslator: new PineconeTranslator(),
  });

  return { selfQueryRetriever, llm, vectorStore };
};

export const POST = async (req: NextRequest) => {
  try {
    const { question, sessionId } = await req.json();

    if (!question) {
      return NextResponse.json(
        { error: "No question provided" },
        { status: 400 }
      );
    }

    let session = sessionId || uuidv4();
    console.log("Using session ID:", session);

    const { selfQueryRetriever, llm, vectorStore } =
      await setupPineconeLangchain();

    if (!chatHistories[session]) {
      console.log(
        "Initializing new chat history and professor for session:",
        session
      );
      chatHistories[session] = { history: [] };
    }

    const combinedMessages = [
      ...chatHistories[session].history,
      new HumanMessage(question),
    ];

    const nameExtractionPrompt = `What is the full name of the professor mentioned? I only want you to return the full name nothing else.`;
    const nameResponse = await llm.invoke([
      new SystemMessage(nameExtractionPrompt),
      ...combinedMessages,
    ]);

    let professorName = "";
    if (typeof nameResponse.content === "string") {
      professorName = nameResponse.content.trim();
    } else if (Array.isArray(nameResponse.content)) {
      professorName = nameResponse.content
        .map((c) => (typeof c === "string" ? c : ""))
        .join(" ")
        .trim();
    }

    const searchResults = await vectorStore.similaritySearch(professorName, 1);
    let fullName = "";

    if (searchResults.length > 0) {
      const fullNameMatch =
        searchResults[0].pageContent.match(/Full name: (.+)/);
      fullName = fullNameMatch ? fullNameMatch[1].trim() : "";
      if (fullName) {
        chatHistories[session].currentProfessor = fullName;
      }
    }

    if (!fullName && chatHistories[session].currentProfessor) {
      fullName = chatHistories[session].currentProfessor;
    }

    const trendLineKeywords = ["trend line", "ratings", "over time", "graph"];
    const isTrendLineQuery = trendLineKeywords.some((keyword) =>
      question.toLowerCase().includes(keyword)
    );

    if (isTrendLineQuery && fullName) {
      const q = query(
        collection(db, "professor_comments"),
        where("professorName", "==", fullName)
      );
      const querySnapshot = await getDocs(q);

      const ratings: any = [];
      querySnapshot.forEach((doc) => {
        ratings.push(doc.data().analyzedComments);
      });

      console.log("Firebase Query Results for Professor:", fullName);
      console.log("Retrieved Ratings Data:", ratings);

      if (ratings.length > 0) {
        return NextResponse.json({
          ratings, // Only send the ratings data
          sessionId: session,
        });
      } else {
        return NextResponse.json({
          response: "No ratings data available for the specified professor.",
          sessionId: session,
        });
      }
    }

    const relevantDocuments = await selfQueryRetriever.invoke(question);
    const documentContents = relevantDocuments
      .map((doc) => doc.pageContent)
      .join("\n");

    chatHistories[session].history.push(new HumanMessage(question));

    const messages = [
      new SystemMessage(prompt),
      ...chatHistories[session].history,
      new AIMessage(documentContents),
    ];

    const response = await llm.invoke(messages);
    const answerContent =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    chatHistories[session].history.push(new AIMessage(answerContent));

    return NextResponse.json({ response: answerContent, sessionId: session });
  } catch (error) {
    console.error("Error processing query:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
};

export const OPTIONS = async () => {
  return NextResponse.json({}, { status: 200 });
};

// New function to clear chat history based on session ID
export const DELETE = async (req: NextRequest) => {
  try {
    const { sessionId } = await req.json();

    if (sessionId && chatHistories[sessionId]) {
      console.log("Clearing chat history for session:", sessionId);
      delete chatHistories[sessionId]; // Clear chat history for this session
    } else {
      console.log("No chat history found for session:", sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing chat history:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
};
