import { MongoClient, ObjectId, type ClientSession, type Db } from "mongodb";

export type ResolutionStatus = "pending" | "resolved" | "needs_escalation";

type ContactDocument = {
  _id: ObjectId;
  name: string;
  resolutionStatus: ResolutionStatus;
  createdAt: Date;
  updatedAt: Date;
};

type IssueDocument = {
  _id: ObjectId;
  contactId: ObjectId;
  description: string;
  createdAt: Date;
};

export type Contact = {
  id: string;
  name: string;
  resolutionStatus: ResolutionStatus;
  createdAt: string;
  updatedAt: string;
};

export type Issue = {
  id: string;
  contactId: string;
  description: string;
  createdAt: string;
};

let client: MongoClient | undefined;
let dbPromise: Promise<Db> | undefined;

async function getDb() {
  if (!dbPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is required.");
    client = new MongoClient(uri);
    dbPromise = client.connect().then(async () => {
      const db = client!.db(process.env.VOICE_AUDIT_DB || "voice_audit_local");
      await db.collection<IssueDocument>("issues").createIndex({ contactId: 1 });
      return db;
    }).catch((error: unknown) => {
      dbPromise = undefined;
      client = undefined;
      throw error;
    });
  }
  return dbPromise;
}

function toContact(document: ContactDocument): Contact {
  return {
    id: document._id.toHexString(),
    name: document.name,
    resolutionStatus: document.resolutionStatus,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function toIssue(document: IssueDocument): Issue {
  return {
    id: document._id.toHexString(),
    contactId: document.contactId.toHexString(),
    description: document.description,
    createdAt: document.createdAt.toISOString(),
  };
}

// Creates a Contact in the prototype database.
export async function createContact(name: string) {
  const now = new Date();
  const document: ContactDocument = {
    _id: new ObjectId(),
    name,
    resolutionStatus: "pending",
    createdAt: now,
    updatedAt: now,
  };
  const db = await getDb();
  await db.collection<ContactDocument>("contacts").insertOne(document);
  return toContact(document);
}

// Lists Contacts for the dashboard, with the newest first.
export async function listContacts() {
  const db = await getDb();
  const documents = await db.collection<ContactDocument>("contacts").find().sort({ createdAt: -1 }).toArray();
  return documents.map(toContact);
}

// Lists saved Issues for the dashboard, with the newest first.
export async function listIssues() {
  const db = await getDb();
  const documents = await db.collection<IssueDocument>("issues").find().sort({ createdAt: -1 }).toArray();
  return documents.map(toIssue);
}

// Finds a Contact selected for a terminal voice session.
export async function getContact(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  const document = await db.collection<ContactDocument>("contacts").findOne({ _id: new ObjectId(id) });
  return document ? toContact(document) : null;
}

// Marks a Contact resolved after the user clearly confirms it.
export async function markResolved(id: string) {
  const db = await getDb();
  const result = await db.collection<ContactDocument>("contacts").findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { resolutionStatus: "resolved", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result ? toContact(result) : null;
}

// Saves an Issue and its Contact status together in one transaction.
export async function recordIssue(id: string, description: string) {
  const db = await getDb();
  const session: ClientSession = client!.startSession();
  const issue: IssueDocument = {
    _id: new ObjectId(),
    contactId: new ObjectId(id),
    description,
    createdAt: new Date(),
  };

  try {
    await session.withTransaction(async () => {
      const contact = await db.collection<ContactDocument>("contacts").findOne({ _id: issue.contactId }, { session });
      if (!contact) throw new Error("Contact not found.");
      await db.collection<IssueDocument>("issues").insertOne(issue, { session });
      await db.collection<ContactDocument>("contacts").updateOne(
        { _id: issue.contactId },
        { $set: { resolutionStatus: "needs_escalation", updatedAt: new Date() } },
        { session },
      );
    });
    return toIssue(issue);
  } finally {
    await session.endSession();
  }
}
