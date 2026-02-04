"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var react_router_dom_1 = require("react-router-dom");
var Dashboard_1 = require("./pages/Dashboard");
var CreatePackage_1 = require("./pages/CreatePackage");
var EditPackage_1 = require("./pages/EditPackage");
function App() {
    return (<react_router_dom_1.BrowserRouter>
      <react_router_dom_1.Routes>
        <react_router_dom_1.Route path="/" element={<Dashboard_1.Dashboard />}/>
        <react_router_dom_1.Route path="/create" element={<CreatePackage_1.CreatePackage />}/>
        <react_router_dom_1.Route path="/edit/:packageId" element={<EditPackage_1.EditPackage />}/>
        <react_router_dom_1.Route path="*" element={<react_router_dom_1.Navigate to="/" replace/>}/>
      </react_router_dom_1.Routes>
    </react_router_dom_1.BrowserRouter>);
}
exports.default = App;
