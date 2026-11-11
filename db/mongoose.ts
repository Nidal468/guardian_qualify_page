import mongoose from "mongoose";

type MongoCache = {
  connection?: typeof mongoose;
  promise?: Promise<typeof mongoose>;
};

const mongoGlobal = globalThis as typeof globalThis & {
  guardianMongo?: MongoCache;
};
const cached = (mongoGlobal.guardianMongo ??= {});

export default async function connectMongo(): Promise<typeof mongoose> {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI is not configured");

  if (cached.connection?.connection.readyState === 1) return cached.connection;

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      maxPoolSize: 50,
      autoIndex: false,
    });
  }

  try {
    cached.connection = await cached.promise;
    if (cached.connection.connection.readyState !== 1) {
      cached.promise = undefined;
      throw new Error("MongoDB is not connected");
    }
    return cached.connection;
  } catch (error) {
    cached.promise = undefined;
    cached.connection = undefined;
    throw error;
  }
}