"use client";

import dynamic from "next/dynamic";

export type { LiveMapUser } from "./AdminUsersMap";

const AdminUsersMap = dynamic(() => import("./AdminUsersMap"), { ssr: false });

export default AdminUsersMap;
