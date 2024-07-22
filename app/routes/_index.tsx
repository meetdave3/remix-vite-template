import { json, type ActionFunction } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSubmit } from "@remix-run/react";
import { useState, useEffect } from "react";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

const flyRegions = [
  { code: "arn", name: "Stockholm, Sweden", flag: "🇸🇪" },
  { code: "syd", name: "Sydney, Australia", flag: "🇦🇺" },
  { code: "hkg", name: "Hong Kong", flag: "🇭🇰" },
  { code: "nrt", name: "Tokyo, Japan", flag: "🇯🇵" },
  { code: "lax", name: "Los Angeles, California (US)", flag: "🇺🇸" },
  { code: "iad", name: "Ashburn, Virginia (US)", flag: "🇺🇸" },
  { code: "dfw", name: "Dallas, Texas (US)", flag: "🇺🇸" },
  { code: "sea", name: "Seattle, Washington (US)", flag: "🇺🇸" },
  { code: "ewr", name: "Secaucus, NJ (US)", flag: "🇺🇸" },
  { code: "maa", name: "Chennai (Madras), India", flag: "🇮🇳" },
  { code: "ams", name: "Amsterdam, Netherlands", flag: "🇳🇱" },
  { code: "cdg", name: "Paris, France", flag: "🇫🇷" },
  { code: "lhr", name: "London, United Kingdom", flag: "🇬🇧" },
  { code: "fra", name: "Frankfurt, Germany", flag: "🇩🇪" },
  { code: "gru", name: "São Paulo, Brazil", flag: "🇧🇷" },
];

export const action: ActionFunction = async ({ request }) => {
  const formData = await request.formData();
  const projectName = formData.get("projectName") as string;
  const region = formData.get("region") as string;

  if (!projectName || !region) {
    return json({ error: "Project name and region are required" }, { status: 400 });
  }

  if (projectName.includes(" ")) {
    return json({ error: "Project name should not contain spaces" }, { status: 400 });
  }

  const commands = [
    { name: "Set GitHub Token", cmd: `export GH_TOKEN=${process.env.GITHUB_TOKEN}` },
    { name: "Create GitHub Repository", cmd: `gh repo create myrevolution-as/${projectName} --private --clone=false` },
    { name: "Clone Template", cmd: `git clone https://github.com/kiliman/remix-vite-template.git ${projectName}` },
    { name: "Change Directory", cmd: `cd ${projectName}` },
    { name: "Set Fly API Token", cmd: `export FLY_API_TOKEN=${process.env.FLY_API_TOKEN}` },
    { name: "Update fly.toml", cmd: `sed -e 's/app = "remix-vite-template"/app = "${projectName}"/' -e 's/primary_region = "iad"/primary_region = "${region}"/' fly.toml > /tmp/fly.toml.tmp && mv /tmp/fly.toml.tmp fly.toml` },
    { name: "Create Fly App", cmd: `fly apps create ${projectName} -o shopoffice` },
    { name: "Deploy to Fly", cmd: `fly deploy -a ${projectName}` },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const command of commands) {
        try {
          controller.enqueue(encoder.encode(`Executing: ${command.name}\n`));
          const { stdout, stderr } = await execPromise(command.cmd);
          controller.enqueue(encoder.encode(`${stdout}\n${stderr}\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`Error: ${error.message}\n`));
          controller.close();
          return;
        }
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};

export default function Index() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const [output, setOutput] = useState("");
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (navigation.state === "submitting") {
      const formData = navigation.formData;
      submit(formData, { method: "post", replace: true });
    }
  }, [navigation.state, navigation.formData, submit]);

  useEffect(() => {
    if (navigation.state === "loading" && actionData instanceof Response) {
      const reader = actionData.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        const readChunk = async () => {
          const { done, value } = await reader.read();
          if (done) return;
          setOutput((prev) => prev + decoder.decode(value));
          readChunk();
        };
        readChunk();
      }
    }
  }, [navigation.state, actionData]);

  const truncatedOutput = output.slice(0, 500);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white bg-opacity-20 backdrop-blur-lg rounded-xl shadow-lg p-6 space-y-6">
        <h1 className="text-3xl font-bold text-center text-white">Project Scaffolder</h1>
        <Form method="post" className="space-y-4">
          <div>
            <label htmlFor="projectName" className="block text-sm font-medium text-white">Project Name:</label>
            <input type="text" id="projectName" name="projectName" required className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2" />
          </div>
          <div>
            <label htmlFor="region" className="block text-sm font-medium text-white">Deployment Region:</label>
            <select id="region" name="region" defaultValue="arn" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 p-2">
              {flyRegions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.flag} {region.name} ({region.code})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="w-full py-4 px-6 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out">
            Create Project
          </button>
        </Form>

        {navigation.state === "submitting" && (
          <div className="text-center">
            <p className="text-white font-semibold animate-pulse">Creating project...</p>
          </div>
        )}

        {output && (
          <div className="mt-6">
            <h2 className="text-xl font-semibold text-white mb-2">Output:</h2>
            <div className="bg-gray-800 rounded-md p-4 max-h-60 overflow-auto">
              <pre className="text-sm text-gray-300 whitespace-pre-wrap">{showMore ? output : truncatedOutput}</pre>
            </div>
            {output.length > 500 && (
              <button
                onClick={() => setShowMore(!showMore)}
                className="mt-2 text-sm text-white hover:underline focus:outline-none"
              >
                {showMore ? "Show Less" : "Show More"}
              </button>
            )}
          </div>
        )}

        {actionData?.error && (
          <div className="mt-4 bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
            <p className="font-bold">Error</p>
            <p>{actionData.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}