import { NextRequest, NextResponse } from "next/server";
import { Pinecone } from "@pinecone-database/pinecone";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PineconeStore } from "@langchain/pinecone";
import puppeteer from "puppeteer-core";
import chromium from "chrome-aws-lambda";
import { Document } from "@langchain/core/documents";
import OpenAI from "openai";
import { db } from "../../config/Firebase"; // Import Firebase Firestore
import { collection, addDoc } from "firebase/firestore";

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to classify sentiment
async function classifySentiment(
  review: string,
  logs: string[]
): Promise<string | null> {
  try {
    logs.push(`Classifying sentiment for review: "${review}"`);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Please classify the sentiment of the following review as Positive, Negative, or Neutral: "${review}". Do not return any other output other than Positive, Negative, or Neutral.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 10,
    });

    const choice = response?.choices?.[0]?.message?.content;
    logs.push(`Sentiment classification result: ${choice}`);
    return choice ? choice.trim() : null;
  } catch (error: any) {
    logs.push(`Error classifying sentiment: ${error.message}`);
    throw new Error(`Error in classifySentiment: ${error.message}`);
  }
}

// Function to chunk text into approximately 2000 character segments
const chunkText = (text: string, chunkSize: number): string[] => {
  const chunks = [];
  for (let i = 0; text.length > i; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
};

// Function to load documents from the web and extract comments and professor's name
const loadDocumentsFromWeb = async (
  url: string,
  logs: string[]
): Promise<{
  docs: Document[];
  analyzedComments: any[];
  professorName: string | null;
}> => {
  try {
    // Ensure Puppeteer is using the correct Chromium path for serverless environments
    const browser = await chromium.puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    });

    logs.push(`Opened browser for URL: ${url}`);
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    logs.push(`Page loaded: ${url}`);

    // Extract the page content as plain text
    const content = await page.evaluate(() => document.body.innerText);

    // Extract the professor's name
    const professorName = await page.evaluate(() => {
      const nameElement = document.querySelector(
        ".NameTitle__Name-dowf0z-0.cfjPUG"
      );
      return nameElement && nameElement.textContent
        ? nameElement.textContent.trim()
        : null;
    });

    // Log the extracted professor's name
    logs.push(`Extracted professor's name: ${professorName}`);

    // Use the correct selector based on the page structure
    const comments = await page.evaluate(() => {
      const commentElements = Array.from(
        document.querySelectorAll(".Comments__StyledComments-dzzyvm-0")
      );
      return commentElements.map((el) =>
        el.textContent ? el.textContent.trim() : ""
      );
    });

    // Perform sentiment analysis on extracted comments
    const analyzedComments = await Promise.all(
      comments.map(async (comment) => {
        const sentiment = await classifySentiment(comment, logs);
        return {
          comment,
          sentiment,
          date: new Date().toISOString(),
        };
      })
    );

    // Log analyzed comments
    logs.push(
      `Analyzed Comments: ${JSON.stringify(analyzedComments, null, 2)}`
    );

    // Upload analyzed comments to Firestore under the professor's name
    if (professorName) {
      const docRef = await addDoc(collection(db, "professor_comments"), {
        professorName,
        analyzedComments,
        url,
        timestamp: new Date().toISOString(),
      });
      logs.push(`Document written with ID: ${docRef.id}`);
    }

    await browser.close();
    logs.push(`Browser closed for URL: ${url}`);

    // Split content into chunks of approximately 2000 characters each
    const chunkSize = 2000;
    const chunks = chunkText(content, chunkSize);

    // Create Document objects from chunks
    const docs = chunks.map(
      (chunk, index) =>
        new Document({
          pageContent: chunk,
          metadata: { url, chunkIndex: index },
        })
    );

    // If professor's name is available, create a document for it
    if (professorName) {
      docs.unshift(
        new Document({
          pageContent: `Full name: ${professorName}`,
          metadata: { url, chunkIndex: -1 }, // Assign a special index for the professor's name
        })
      );
    }

    return { docs, analyzedComments, professorName };
  } catch (error: any) {
    logs.push(`Error loading documents from web: ${error.message}`);
    throw new Error(`Error in loadDocumentsFromWeb: ${error.message}`);
  }
};

// Function to set up Pinecone and Langchain, and handle professor's name
const setupPineconeLangchain = async (
  urls: string[],
  logs: string[]
): Promise<{
  vectorStore: PineconeStore;
  analyzedComments: any[];
  professorNames: string[];
}> => {
  try {
    let allDocs: Document[] = [];
    let allAnalyzedComments: any[] = [];
    let professorNames: string[] = [];

    for (const url of urls) {
      const { docs, analyzedComments, professorName } =
        await loadDocumentsFromWeb(url, logs);
      allDocs = allDocs.concat(docs);
      allAnalyzedComments = allAnalyzedComments.concat(analyzedComments);
      if (professorName) {
        professorNames.push(professorName);
      }
    }

    // Initialize Pinecone
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });
    const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX as string);
    logs.push("Pinecone index initialized");

    // Initialize embeddings
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY as string,
    });
    logs.push("Embeddings instance created");

    // Create vector store from all documents
    const vectorStore = await PineconeStore.fromDocuments(allDocs, embeddings, {
      pineconeIndex: pineconeIndex,
    });
    logs.push("Vector store created");

    return {
      vectorStore,
      analyzedComments: allAnalyzedComments,
      professorNames,
    };
  } catch (error: any) {
    logs.push(`Error in setupPineconeLangchain: ${error.message}`);
    throw new Error(`Error in setupPineconeLangchain: ${error.message}`);
  }
};

// POST handler to process URL and return professor's name and analyzed comments
export const POST = async (req: NextRequest) => {
  let logs: string[] = [];
  try {
    logs.push("Received request to process URL");

    const { url } = await req.json(); // Extract the URL from the request body

    if (!url) {
      logs.push("No URL provided");
      return NextResponse.json(
        { error: "No URL provided", logs },
        { status: 400 }
      );
    }

    const { vectorStore, analyzedComments, professorNames } =
      await setupPineconeLangchain([url], logs);
    logs.push(
      "Pinecone and LangChain setup complete, documents inserted into vector store"
    );

    return NextResponse.json({
      message: "Document successfully inserted into vector store",
      analyzedComments,
      professorNames,
      logs,
    });
  } catch (error: any) {
    logs.push(`Error processing URL: ${error.message}`);
    console.error("Error processing URL in POST handler:", error);
    return NextResponse.json(
      { error: "Internal Server Error", logs },
      { status: 500 }
    );
  }
};

export const OPTIONS = async () => {
  return NextResponse.json({}, { status: 200 });
};
