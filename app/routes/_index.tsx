import { json, type ActionFunction } from "@remix-run/node";
import { Form, useActionData, useNavigation, useSubmit } from "@remix-run/react";
import { useEffect, useState } from "react";
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
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.4" }}>
      <h1>Project Scaffolder</h1>
      <Form method="post">
        <div>
          <label htmlFor="projectName">Project Name:</label>
          <input type="text" id="projectName" name="projectName" required />
        </div>
        <div>
          <label htmlFor="region">Deployment Region:</label>
          <select id="region" name="region" defaultValue="arn">
            {flyRegions.map((region) => (
              <option key={region.code} value={region.code}>
                {region.flag} {region.name} ({region.code})
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Create Project</button>
      </Form>

      {navigation.state === "submitting" && <p>Creating project...</p>}

      {output && (
        <div>
          <h2>Output:</h2>
          <pre>{showMore ? output : truncatedOutput}</pre>
          {output.length > 500 && (
            <button onClick={() => setShowMore(!showMore)}>
              {showMore ? "Show Less" : "Show More"}
            </button>
          )}
        </div>
      )}

      {actionData?.error && (
        <div style={{ color: "red" }}>
          <p>Error: {actionData.error}</p>
        </div>
      )}
    </div>
  );
}