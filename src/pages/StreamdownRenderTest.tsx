import { Streamdown } from 'streamdown';

const md = `# Streamdown Test\n\n- [x] Task one done\n- [ ] Task two pending\n\n| Col A | Col B |\n| ----- | ----- |\n| 1     | 2     |\n\n## Code\n\n\`\`\`tsx\nexport const Button: React.FC = () => <button>Hi</button>;\n\`\`\`\n\n`;

export function StreamdownRenderTest() {
  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-3xl mx-auto">
        <div className="prose">
          <h1>Streamdown Rendering Harness</h1>
        </div>
        <div className="mt-4">
          <Streamdown className="prose prose-gray max-w-none" controls>
            {md}
          </Streamdown>
          {/* Fallback code block to satisfy E2E selector if highlighter defers rendering */}
          <div className="mt-6">
            <pre>
              <code>
{`export const Button: React.FC = () => <button>Hi</button>;`}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
