<%@page contentType="text/html" pageEncoding="UTF-8" import="java.io.*"%>
<!DOCTYPE html>
<html>
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>BufferedReader</title>
</head>
<body>
    <%
    String path = this.getServletContext().getRealPath("/launch.bat");
    File file = new File(path);
    FileReader reader = new FileReader(file);
    BufferedReader br = new BufferedReader(reader);
    while(br.ready()){
        out.print(br.readLine() + "<BR>");
    }
    reader.close();
    %>
</body>
</html>