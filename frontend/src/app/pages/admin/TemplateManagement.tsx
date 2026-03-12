import { Link, useLocation } from "react-router";
import { useEffect, useState } from "react";
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  FileText, 
  Database,
  LogOut,
  Eye,
  Power,
  PowerOff,
  Edit
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { adminAPI } from "../../services/api";

const sidebarLinks = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: Users, label: "User Management", path: "/admin/users" },
  { icon: BarChart3, label: "Resume & ATS Stats", path: "/admin/stats" },
  { icon: FileText, label: "Template Management", path: "/admin/templates" },
  { icon: Database, label: "Keywords Library", path: "/admin/keywords" },
];

const templateSeed = [
  {
    id: 1,
    name: "Classic Professional",
    description: "Traditional layout perfect for corporate roles and experienced professionals",
    active: true,
    usage: 3584,
    atsScore: 95,
    lastUpdated: "2024-01-15",
  },
  {
    id: 2,
    name: "Fresher Clean",
    description: "Modern minimalist design ideal for entry-level candidates and recent graduates",
    active: true,
    usage: 2891,
    atsScore: 92,
    lastUpdated: "2024-02-10",
  },
  {
    id: 3,
    name: "Experienced Tech",
    description: "Tech-focused layout with emphasis on skills and projects for senior tech roles",
    active: true,
    usage: 1967,
    atsScore: 94,
    lastUpdated: "2024-01-28",
  },
  {
    id: 4,
    name: "Creative Modern",
    description: "Stylish design for creative professionals and designers",
    active: false,
    usage: 543,
    atsScore: 88,
    lastUpdated: "2023-12-05",
  },
  {
    id: 5,
    name: "Executive Elite",
    description: "Premium layout for C-level executives and senior management",
    active: false,
    usage: 234,
    atsScore: 96,
    lastUpdated: "2023-11-20",
  },
];

export default function TemplateManagement() {
  const location = useLocation();
  const [templates, setTemplates] = useState<any[]>(templateSeed);

  useEffect(() => {
    const load = async () => {
      try {
        const data: any = await adminAPI.getTemplates();
        const list = data?.templates || [];
        if (Array.isArray(list) && list.length > 0) {
          setTemplates(list.map((t: any, index: number) => ({
            id: t._id || index + 1,
            name: t.name || "Template",
            description: t.description || "ATS-safe single-column template",
            active: t.isActive !== false,
            usage: t.usageCount || 0,
            atsScore: t.atsScore || 90,
            lastUpdated: t.updatedAt ? new Date(t.updatedAt).toISOString().slice(0, 10) : "-",
          })));
        }
      } catch (error) {
        console.error("Failed to load templates:", error);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 font-['Inter']">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-screen sticky top-0">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <FileText className="w-8 h-8 text-indigo-600" />
              <div>
                <span className="text-xl font-bold text-gray-900 block">B2World</span>
                <span className="text-xs text-gray-600">Admin Panel</span>
              </div>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              return (
                <Link key={link.path} to={link.path}>
                  <div
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? "bg-indigo-50 text-indigo-600"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium text-sm">{link.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
                <span className="text-white font-semibold">A</span>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900 text-sm">Admin User</div>
                <div className="text-xs text-gray-600">admin@b2world.com</div>
              </div>
              <Link to="/">
                <Button variant="ghost" size="sm">
                  <LogOut className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Template Management</h1>
              <p className="text-gray-600">Manage and configure resume templates</p>
            </div>
            <Button className="bg-indigo-600 hover:bg-indigo-700">
              <FileText className="w-4 h-4 mr-2" />
              Add New Template
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Total Templates</div>
                <div className="text-3xl font-bold text-gray-900">{templates.length}</div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Active Templates</div>
                <div className="text-3xl font-bold text-green-600">
                  {templates.filter(t => t.active).length}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Total Usage</div>
                <div className="text-3xl font-bold text-indigo-600">
                  {templates.reduce((sum, t) => sum + t.usage, 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Avg. ATS Score</div>
                <div className="text-3xl font-bold text-gray-900">
                  {(templates.reduce((sum, t) => sum + t.atsScore, 0) / templates.length).toFixed(1)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Templates List */}
          <div className="space-y-4">
            {templates.map((template) => (
              <Card key={template.id} className="border border-gray-200 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start gap-6">
                    {/* Template Preview */}
                    <div className="w-32 h-40 bg-gray-100 rounded-lg border-2 border-gray-200 flex-shrink-0">
                      <div className="p-3 bg-white h-full rounded-lg">
                        <div className="space-y-2">
                          <div className="h-2 bg-gray-800 w-16 mx-auto rounded"></div>
                          <div className="h-1 bg-gray-400 w-20 mx-auto rounded"></div>
                          <div className="border-t border-gray-300 my-2"></div>
                          <div className="space-y-1">
                            <div className="h-1 bg-gray-300 w-full rounded"></div>
                            <div className="h-1 bg-gray-200 w-full rounded"></div>
                            <div className="h-1 bg-gray-200 w-3/4 rounded"></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Template Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-900">{template.name}</h3>
                            <Badge variant={template.active ? "default" : "secondary"} 
                              className={template.active ? "bg-green-600" : "bg-gray-500"}>
                              {template.active ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-gray-600 mb-3">{template.description}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div>
                          <div className="text-sm text-gray-600">Usage Count</div>
                          <div className="text-lg font-bold text-gray-900">{template.usage.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">ATS Score</div>
                          <div className="text-lg font-bold text-green-600">{template.atsScore}/100</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Last Updated</div>
                          <div className="text-lg font-bold text-gray-900">{template.lastUpdated}</div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-600">Status</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Switch defaultChecked={template.active} />
                            <span className="text-sm text-gray-700">
                              {template.active ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        {template.active ? (
                          <Button variant="outline" size="sm">
                            <PowerOff className="w-4 h-4 mr-2" />
                            Deactivate
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm">
                            <Power className="w-4 h-4 mr-2" />
                            Activate
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
