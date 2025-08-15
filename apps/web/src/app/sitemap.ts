import type { MetadataRoute } from "next";

const addPathToBaseURL = (path: string) => `https://www.openstatus.dev${path}`;

export default function sitemap(): MetadataRoute.Sitemap {

  const routes = [
    "/",
    "/app/login",
  ].map((route) => ({
    url: addPathToBaseURL(route),
    lastModified: new Date(),
  }));

  return [...routes];
}
