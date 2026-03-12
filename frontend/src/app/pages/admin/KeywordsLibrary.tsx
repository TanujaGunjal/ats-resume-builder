import { Link, useLocation } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  FileText, 
  Database,
  LogOut,
  Plus,
  Trash2,
  Edit,
  X
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Badge } from "../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { adminAPI } from "../../services/api";
import { toast } from "sonner";

const sidebarLinks = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: Users, label: "User Management", path: "/admin/users" },
  { icon: BarChart3, label: "Resume & ATS Stats", path: "/admin/stats" },
  { icon: FileText, label: "Template Management", path: "/admin/templates" },
  { icon: Database, label: "Keywords Library", path: "/admin/keywords" },
];

const keywordRolesSeed = [
  {
    role: "Java Developer",
    keywords: [
      "Java", "Spring Boot", "Hibernate", "Maven", "JUnit", "RESTful APIs",
      "Microservices", "SQL", "Oracle", "PostgreSQL", "Git", "Jenkins",
      "Docker", "Kubernetes", "Agile", "Scrum"
    ],
  },
  {
    role: "Full Stack Developer",
    keywords: [
      "React", "Node.js", "JavaScript", "TypeScript", "HTML5", "CSS3",
      "MongoDB", "Express.js", "RESTful APIs", "GraphQL", "Git", "AWS",
      "Docker", "CI/CD", "Jest", "Testing"
    ],
  },
  {
    role: "Data Analyst",
    keywords: [
      "Python", "SQL", "Excel", "Tableau", "Power BI", "Data Visualization",
      "Statistical Analysis", "Pandas", "NumPy", "Machine Learning", "R",
      "ETL", "Data Warehousing", "Business Intelligence", "Dashboard"
    ],
  },
  {
    role: "HR Manager",
    keywords: [
      "Recruitment", "Talent Acquisition", "Employee Relations", "HRIS",
      "Performance Management", "Onboarding", "Training & Development",
      "Labor Law", "Benefits Administration", "Compensation", "Conflict Resolution",
      "Diversity & Inclusion", "Workforce Planning", "HR Policies"
    ],
  },
  {
    role: "Sales Executive",
    keywords: [
      "Sales Strategy", "Lead Generation", "Client Relationship", "Negotiation",
      "CRM", "Salesforce", "Revenue Growth", "B2B Sales", "B2C Sales",
      "Cold Calling", "Product Demo", "Quota Achievement", "Pipeline Management",
      "Account Management", "Customer Retention"
    ],
  },
];

export default function KeywordsLibrary() {
  const location = useLocation();
  const [keywordRoles, setKeywordRoles] = useState<any[]>(keywordRolesSeed);
  const [selectedRole, setSelectedRole] = useState(keywordRolesSeed[0].role);
  const [newKeyword, setNewKeyword] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [showAddRoleDialog, setShowAddRoleDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestionRulesCount, setSuggestionRulesCount] = useState(0);

  // Fetch keywords on mount
  useEffect(() => {
    fetchKeywords();
  }, []);

  const fetchKeywords = async () => {
    try {
      const keywordData: any = await adminAPI.getKeywords();
      const getRules = (adminAPI as any).getSuggestionRules || (adminAPI as any).getSuggestionsRules;
      const rulesData: any = getRules ? await getRules() : null;
      const libs = keywordData?.data?.libraries || keywordData?.libraries || [];
      const mapped = Array.isArray(libs) && libs.length > 0
        ? libs.map((lib: any) => {
            // Handle both old structure (requiredKeywords, preferredKeywords, tools)
            // and new structure (keywords array of objects)
            let keywords = [];
            
            if (lib.keywords && Array.isArray(lib.keywords)) {
              // New structure: keywords is array of objects with 'term' field
              keywords = lib.keywords.map((k: any) => 
                typeof k === 'string' ? k : k.term || ''
              ).filter((k: string) => k);
            }
            
            // Fallback to old structure if no keywords
            if (keywords.length === 0) {
              keywords = [
                ...(lib.requiredKeywords || []),
                ...(lib.preferredKeywords || []),
                ...(lib.tools || []),
              ];
            }
            
            return {
              role: lib.role,
              keywords: keywords,
            };
          })
        : keywordRolesSeed;
      setKeywordRoles(mapped);
      if (mapped.length > 0 && !mapped.find((r: any) => r.role === selectedRole)) {
        setSelectedRole(mapped[0].role);
      }
      setSuggestionRulesCount(rulesData?.data?.count || rulesData?.count || 0);
    } catch (error) {
      console.error("Failed to load keyword libraries:", error);
      toast.error("Failed to load keywords");
    }
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) {
      toast.error("Please enter a role name");
      return;
    }

    setIsLoading(true);
    try {
      await adminAPI.addRoleKeywordLibrary(newRoleName.trim());
      toast.success("Role added successfully");
      setNewRoleName("");
      setShowAddRoleDialog(false);
      await fetchKeywords();
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to add role";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRole = async (role: string) => {
    if (!window.confirm(`Are you sure you want to delete the "${role}" role?`)) {
      return;
    }

    setIsLoading(true);
    try {
      await adminAPI.deleteRoleKeywordLibrary(role);
      toast.success("Role deleted successfully");
      setSelectedRole(keywordRoles[0]?.role || "");
      await fetchKeywords();
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to delete role";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!newKeyword.trim()) {
      toast.error("Please enter a keyword");
      return;
    }

    setIsLoading(true);
    try {
      await adminAPI.addKeywordToRole(selectedRole, newKeyword.trim());
      toast.success("Keyword added successfully");
      setNewKeyword("");
      await fetchKeywords();
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to add keyword";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveKeyword = async (keyword: string) => {
    setIsLoading(true);
    try {
      await adminAPI.removeKeywordFromRole(selectedRole, keyword);
      toast.success("Keyword removed successfully");
      await fetchKeywords();
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to remove keyword";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentRoleData = useMemo(() => keywordRoles.find(r => r.role === selectedRole), [keywordRoles, selectedRole]);

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
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Keywords Library</h1>
              <p className="text-gray-600">Manage role-specific keywords for ATS optimization</p>
            </div>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => setShowAddRoleDialog(true)}
              disabled={isLoading}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Role
            </Button>
          </div>

          {/* Add Role Dialog */}
          {showAddRoleDialog && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <Card className="w-full max-w-md">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-gray-900">Add New Role</h2>
                    <button
                      onClick={() => setShowAddRoleDialog(false)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label className="block mb-2">Role Name</Label>
                      <Input
                        placeholder="e.g., React Developer, Product Manager"
                        value={newRoleName}
                        onChange={(e) => setNewRoleName(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") handleAddRole();
                        }}
                      />
                    </div>
                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowAddRoleDialog(false)}
                        className="flex-1"
                        disabled={isLoading}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                        onClick={handleAddRole}
                        disabled={isLoading}
                      >
                        {isLoading ? "Creating..." : "Create Role"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Stats Cards */}
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Total Roles</div>
                <div className="text-3xl font-bold text-gray-900">{keywordRoles.length}</div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Total Keywords</div>
                <div className="text-3xl font-bold text-indigo-600">
                  {keywordRoles.reduce((sum, role) => sum + role.keywords.length, 0)}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Avg. Keywords/Role</div>
                <div className="text-3xl font-bold text-green-600">
                  {(keywordRoles.reduce((sum, role) => sum + role.keywords.length, 0) / keywordRoles.length).toFixed(0)}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <div className="text-sm text-gray-600 mb-1">Last Updated</div>
                <div className="text-lg font-bold text-gray-900">{suggestionRulesCount} Rules</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Left Column - Roles List */}
            <Card className="border border-gray-200">
              <CardContent className="p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Job Roles</h2>
                <div className="space-y-2">
                  {keywordRoles.map((roleData) => (
                    <button
                      key={roleData.role}
                      onClick={() => setSelectedRole(roleData.role)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                        selectedRole === roleData.role
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                          : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{roleData.role}</span>
                        <Badge variant="secondary" className="text-xs">
                          {roleData.keywords.length}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>

                <Button 
                  variant="outline" 
                  className="w-full mt-4"
                  onClick={() => setShowAddRoleDialog(true)}
                  disabled={isLoading}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Role
                </Button>
              </CardContent>
            </Card>

            {/* Right Column - Keywords Management */}
            <div className="lg:col-span-2 space-y-6">
              {/* Role Header */}
              <Card className="border border-gray-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-1">{selectedRole}</h2>
                      <p className="text-sm text-gray-600">
                        {currentRoleData?.keywords.length} keywords defined
                      </p>
                    </div>
                  <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled={isLoading}
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Edit Role
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteRole(selectedRole)}
                        disabled={isLoading}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Add Keyword */}
              <Card className="border border-gray-200">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Add New Keyword</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Input
                        placeholder="Enter keyword (e.g., React, Leadership, Python)"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") handleAddKeyword();
                        }}
                        disabled={isLoading}
                      />
                    </div>
                    <Button 
                      className="bg-indigo-600 hover:bg-indigo-700"
                      onClick={handleAddKeyword}
                      disabled={isLoading}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Keywords List */}
              <Card className="border border-gray-200">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Current Keywords</h3>
                  <div className="flex flex-wrap gap-2">
                    {currentRoleData?.keywords.map((keyword: string, index: number) => (
                      <Badge
                        key={index}
                        className="px-3 py-2 text-sm bg-indigo-100 text-indigo-700 hover:bg-indigo-200 cursor-pointer"
                      >
                        <span>{keyword}</span>
                        <button 
                          className="ml-2 hover:text-indigo-900 font-bold"
                          onClick={() => handleRemoveKeyword(keyword)}
                          disabled={isLoading}
                          title="Remove keyword"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Bulk Actions */}
              <Card className="border border-indigo-200 bg-indigo-50">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-indigo-900 mb-3">Bulk Actions</h3>
                  <div className="flex gap-3">
                    <Button variant="outline" size="sm" className="bg-white">
                      Import from CSV
                    </Button>
                    <Button variant="outline" size="sm" className="bg-white">
                      Export Keywords
                    </Button>
                    <Button variant="outline" size="sm" className="bg-white">
                      Clear All
                    </Button>
                  </div>
                  <p className="text-sm text-indigo-700 mt-3">
                    <strong>Tip:</strong> Keep keywords relevant and specific to the job role for better ATS optimization results.
                  </p>
                </CardContent>
              </Card>

              {/* Statistics */}
              <Card className="border border-gray-200">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900 mb-4">Keyword Categories</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Technical Skills</span>
                      <Badge variant="secondary">45%</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Soft Skills</span>
                      <Badge variant="secondary">25%</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Tools & Technologies</span>
                      <Badge variant="secondary">20%</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Certifications</span>
                      <Badge variant="secondary">10%</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
