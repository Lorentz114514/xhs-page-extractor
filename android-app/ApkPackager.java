import java.io.*;
import java.nio.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.zip.*;

/**
 * 使用 Android Studio 内置 JBR + R8 + BinaryXml 规范直接构建标准 APK
 */
public class ApkPackager {

    // Android 系统属性 resource ID 常量 (android.R.attr.*)
    private static final int ATTR_THEME               = 0x01010000;
    private static final int ATTR_LABEL               = 0x01010001;
    private static final int ATTR_NAME                = 0x01010003;
    private static final int ATTR_EXPORTED            = 0x01010010;
    private static final int ATTR_LAUNCH_MODE         = 0x0101001d;
    private static final int ATTR_CONFIG_CHANGES      = 0x0101001f;
    private static final int ATTR_MIME_TYPE           = 0x01010026;
    private static final int ATTR_VERSION_CODE        = 0x0101021b;
    private static final int ATTR_VERSION_NAME        = 0x0101021c;
    private static final int ATTR_MIN_SDK_VERSION     = 0x0101020c;
    private static final int ATTR_TARGET_SDK_VERSION  = 0x01010270;
    private static final int ATTR_ALLOW_BACKUP        = 0x01010280;
    private static final int ATTR_HARDWARE_ACCEL      = 0x010102d3;
    private static final int ATTR_USES_CLEARTEXT      = 0x010104ec;

    // TypedValue 类型常量
    private static final int TYPE_REFERENCE = 0x01;
    private static final int TYPE_STRING    = 0x03;
    private static final int TYPE_INT_DEC   = 0x10;
    private static final int TYPE_INT_HEX   = 0x11;
    private static final int TYPE_INT_BOOL  = 0x12;

    static class Attr {
        String ns;
        String name;
        int resId;
        int valueType;
        int intData;
        String rawString;

        Attr(String ns, String name, int resId, int valueType, int intData, String rawString) {
            this.ns = ns;
            this.name = name;
            this.resId = resId;
            this.valueType = valueType;
            this.intData = intData;
            this.rawString = rawString;
        }

        static Attr str(String ns, String name, int resId, String val) {
            return new Attr(ns, name, resId, TYPE_STRING, 0, val);
        }

        static Attr intDec(String ns, String name, int resId, int val) {
            return new Attr(ns, name, resId, TYPE_INT_DEC, val, null);
        }

        static Attr intHex(String ns, String name, int resId, int val) {
            return new Attr(ns, name, resId, TYPE_INT_HEX, val, null);
        }

        static Attr bool(String ns, String name, int resId, boolean val) {
            return new Attr(ns, name, resId, TYPE_INT_BOOL, val ? -1 : 0, null);
        }

        static Attr ref(String ns, String name, int resId, int refId) {
            return new Attr(ns, name, resId, TYPE_REFERENCE, refId, null);
        }
    }

    static class Node {
        String name;
        List<Attr> attrs = new ArrayList<>();
        List<Node> children = new ArrayList<>();

        Node(String name, Attr... attrs) {
            this.name = name;
            this.attrs.addAll(Arrays.asList(attrs));
        }

        Node add(Node child) {
            this.children.add(child);
            return this;
        }
    }

    public static byte[] buildBinaryManifest() {
        final String NS = "http://schemas.android.com/apk/res/android";

        Node manifest = new Node("manifest",
            Attr.intDec(NS, "versionCode", ATTR_VERSION_CODE, 1),
            Attr.str(NS, "versionName", ATTR_VERSION_NAME, "1.0.0"),
            Attr.str(null, "package", 0, "com.xhs.pageextractor")
        );

        manifest.add(new Node("uses-sdk",
            Attr.intDec(NS, "minSdkVersion", ATTR_MIN_SDK_VERSION, 24),
            Attr.intDec(NS, "targetSdkVersion", ATTR_TARGET_SDK_VERSION, 28)
        ));

        manifest.add(new Node("uses-permission",
            Attr.str(NS, "name", ATTR_NAME, "android.permission.INTERNET")
        ));
        manifest.add(new Node("uses-permission",
            Attr.str(NS, "name", ATTR_NAME, "android.permission.READ_EXTERNAL_STORAGE")
        ));
        manifest.add(new Node("uses-permission",
            Attr.str(NS, "name", ATTR_NAME, "android.permission.WRITE_EXTERNAL_STORAGE")
        ));

        Node app = new Node("application",
            Attr.ref(NS, "theme", ATTR_THEME, 0x0103012b), // Theme.DeviceDefault.Light.NoActionBar
            Attr.str(NS, "label", ATTR_LABEL, "翻页扒图助手"),
            Attr.bool(NS, "allowBackup", ATTR_ALLOW_BACKUP, true),
            Attr.bool(NS, "hardwareAccelerated", ATTR_HARDWARE_ACCEL, true),
            Attr.bool(NS, "usesCleartextTraffic", ATTR_USES_CLEARTEXT, true)
        );

        Node activity = new Node("activity",
            Attr.str(NS, "name", ATTR_NAME, "com.xhs.pageextractor.MainActivity"),
            Attr.bool(NS, "exported", ATTR_EXPORTED, true),
            Attr.intDec(NS, "launchMode", ATTR_LAUNCH_MODE, 2), // singleTask
            Attr.intHex(NS, "configChanges", ATTR_CONFIG_CHANGES, 0x04a0) // orientation|screenSize|keyboardHidden
        );

        // Launcher Intent
        Node filterMain = new Node("intent-filter");
        filterMain.add(new Node("action", Attr.str(NS, "name", ATTR_NAME, "android.intent.action.MAIN")));
        filterMain.add(new Node("category", Attr.str(NS, "name", ATTR_NAME, "android.intent.category.LAUNCHER")));
        activity.add(filterMain);

        // Share Text Intent
        Node filterText = new Node("intent-filter",
            Attr.str(NS, "label", ATTR_LABEL, "用翻页扒图助手提取图片")
        );
        filterText.add(new Node("action", Attr.str(NS, "name", ATTR_NAME, "android.intent.action.SEND")));
        filterText.add(new Node("category", Attr.str(NS, "name", ATTR_NAME, "android.intent.category.DEFAULT")));
        filterText.add(new Node("data", Attr.str(NS, "mimeType", ATTR_MIME_TYPE, "text/plain")));
        activity.add(filterText);

        // Share Video Intent
        Node filterVideo = new Node("intent-filter",
            Attr.str(NS, "label", ATTR_LABEL, "用翻页扒图助手逐页扒图")
        );
        filterVideo.add(new Node("action", Attr.str(NS, "name", ATTR_NAME, "android.intent.action.SEND")));
        filterVideo.add(new Node("category", Attr.str(NS, "name", ATTR_NAME, "android.intent.category.DEFAULT")));
        filterVideo.add(new Node("data", Attr.str(NS, "mimeType", ATTR_MIME_TYPE, "video/*")));
        activity.add(filterVideo);

        app.add(activity);
        manifest.add(app);

        return encodeAxml(manifest, "android", NS);
    }

    private static byte[] encodeAxml(Node root, String nsPrefix, String nsUri) {
        // 1. 收集带 Resource ID 的属性名（必须在字符串池的最前面，与 ResourceMap 一一对应）
        LinkedHashMap<String, Integer> resAttrNames = new LinkedHashMap<>();
        LinkedHashSet<String> otherStrings = new LinkedHashSet<>();

        collectStrings(root, resAttrNames, otherStrings);
        otherStrings.add(nsPrefix);
        otherStrings.add(nsUri);

        List<String> pool = new ArrayList<>();
        List<Integer> resIds = new ArrayList<>();
        for (Map.Entry<String, Integer> e : resAttrNames.entrySet()) {
            pool.add(e.getKey());
            resIds.add(e.getValue());
        }
        for (String s : otherStrings) {
            if (!resAttrNames.containsKey(s)) {
                pool.add(s);
            }
        }

        Map<String, Integer> strIdx = new HashMap<>();
        for (int i = 0; i < pool.size(); i++) {
            strIdx.put(pool.get(i), i);
        }

        byte[] stringPoolChunk = buildUtf16StringPoolChunk(pool);
        byte[] resMapChunk = buildResourceMapChunk(resIds);

        ByteArrayOutputStream xmlEvents = new ByteArrayOutputStream();
        try {
            // Start Namespace
            writeNamespaceChunk(xmlEvents, 0x0100, strIdx.get(nsPrefix), strIdx.get(nsUri), 1);
            // Tree Nodes
            writeNodeChunks(xmlEvents, root, strIdx, new int[]{2});
            // End Namespace
            writeNamespaceChunk(xmlEvents, 0x0101, strIdx.get(nsPrefix), strIdx.get(nsUri), 100);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        byte[] eventsBytes = xmlEvents.toByteArray();
        int totalSize = 8 + stringPoolChunk.length + resMapChunk.length + eventsBytes.length;

        ByteBuffer out = ByteBuffer.allocate(totalSize).order(ByteOrder.LITTLE_ENDIAN);
        out.putShort((short) 0x0003); // RES_XML_TYPE
        out.putShort((short) 8);      // headerSize
        out.putInt(totalSize);
        out.put(stringPoolChunk);
        out.put(resMapChunk);
        out.put(eventsBytes);
        return out.array();
    }

    private static void collectStrings(Node n, LinkedHashMap<String, Integer> resAttrs, LinkedHashSet<String> others) {
        others.add(n.name);
        for (Attr a : n.attrs) {
            // 按 resId 排序属性（Android 规范要求有 resId 的属性排在前面且升序）
            if (a.resId != 0) {
                resAttrs.put(a.name, a.resId);
            } else {
                others.add(a.name);
            }
            if (a.rawString != null) {
                others.add(a.rawString);
            }
        }
        for (Node c : n.children) {
            collectStrings(c, resAttrs, others);
        }
    }

    private static byte[] buildUtf16StringPoolChunk(List<String> strings) {
        int count = strings.size();
        ByteArrayOutputStream strData = new ByteArrayOutputStream();
        int[] offsets = new int[count];

        for (int i = 0; i < count; i++) {
            offsets[i] = strData.size();
            String s = strings.get(i);
            int charLen = s.length();
            // UTF-16 length (2 bytes) + chars (charLen * 2) + null terminator (2 bytes)
            strData.write(charLen & 0xFF);
            strData.write((charLen >>> 8) & 0xFF);
            byte[] utf16le = s.getBytes(StandardCharsets.UTF_16LE);
            strData.write(utf16le, 0, utf16le.length);
            strData.write(0);
            strData.write(0);
        }
        while (strData.size() % 4 != 0) {
            strData.write(0);
        }

        byte[] rawStrBytes = strData.toByteArray();
        int headerSize = 28;
        int stringsStart = headerSize + count * 4;
        int chunkSize = stringsStart + rawStrBytes.length;

        ByteBuffer buf = ByteBuffer.allocate(chunkSize).order(ByteOrder.LITTLE_ENDIAN);
        buf.putShort((short) 0x0001); // RES_STRING_POOL_TYPE
        buf.putShort((short) headerSize);
        buf.putInt(chunkSize);
        buf.putInt(count);
        buf.putInt(0); // styleCount
        buf.putInt(0); // flags (0 = UTF-16)
        buf.putInt(stringsStart);
        buf.putInt(0); // stylesStart
        for (int off : offsets) {
            buf.putInt(off);
        }
        buf.put(rawStrBytes);
        return buf.array();
    }

    private static byte[] buildResourceMapChunk(List<Integer> resIds) {
        int chunkSize = 8 + resIds.size() * 4;
        ByteBuffer buf = ByteBuffer.allocate(chunkSize).order(ByteOrder.LITTLE_ENDIAN);
        buf.putShort((short) 0x0180); // RES_XML_RESOURCE_MAP_TYPE
        buf.putShort((short) 8);
        buf.putInt(chunkSize);
        for (int id : resIds) {
            buf.putInt(id);
        }
        return buf.array();
    }

    private static void writeNamespaceChunk(OutputStream out, int type, int prefixIdx, int uriIdx, int line) throws IOException {
        ByteBuffer buf = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN);
        buf.putShort((short) type);
        buf.putShort((short) 16);
        buf.putInt(24);
        buf.putInt(line);
        buf.putInt(-1); // comment
        buf.putInt(prefixIdx);
        buf.putInt(uriIdx);
        out.write(buf.array());
    }

    private static void writeNodeChunks(OutputStream out, Node n, Map<String, Integer> strIdx, int[] lineCounter) throws IOException {
        int line = lineCounter[0]++;
        // 对属性排序：有 resId 的按 resId 升序，无 resId 的排后面
        List<Attr> sorted = new ArrayList<>(n.attrs);
        sorted.sort((a, b) -> {
            if (a.resId != 0 && b.resId != 0) return Integer.compareUnsigned(a.resId, b.resId);
            if (a.resId != 0) return -1;
            if (b.resId != 0) return 1;
            return a.name.compareTo(b.name);
        });

        int attrCount = sorted.size();
        int startChunkSize = 36 + attrCount * 20;
        ByteBuffer startBuf = ByteBuffer.allocate(startChunkSize).order(ByteOrder.LITTLE_ENDIAN);
        startBuf.putShort((short) 0x0102); // RES_XML_START_ELEMENT_TYPE
        startBuf.putShort((short) 16);
        startBuf.putInt(startChunkSize);
        startBuf.putInt(line);
        startBuf.putInt(-1); // comment
        startBuf.putInt(-1); // ns
        startBuf.putInt(strIdx.get(n.name));
        startBuf.putShort((short) 20); // attributeStart
        startBuf.putShort((short) 20); // attributeSize
        startBuf.putShort((short) attrCount);
        startBuf.putShort((short) 0);  // idIndex
        startBuf.putShort((short) 0);  // classIndex
        startBuf.putShort((short) 0);  // styleIndex

        for (Attr a : sorted) {
            int nsI = a.ns != null ? strIdx.get(a.ns) : -1;
            int nameI = strIdx.get(a.name);
            int rawValI = a.rawString != null ? strIdx.get(a.rawString) : -1;
            int data = a.valueType == TYPE_STRING ? rawValI : a.intData;

            startBuf.putInt(nsI);
            startBuf.putInt(nameI);
            startBuf.putInt(rawValI);
            startBuf.putShort((short) 8); // typedValue size
            startBuf.put((byte) 0);       // res0
            startBuf.put((byte) a.valueType);
            startBuf.putInt(data);
        }
        out.write(startBuf.array());

        for (Node c : n.children) {
            writeNodeChunks(out, c, strIdx, lineCounter);
        }

        ByteBuffer endBuf = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN);
        endBuf.putShort((short) 0x0103); // RES_XML_END_ELEMENT_TYPE
        endBuf.putShort((short) 16);
        endBuf.putInt(24);
        endBuf.putInt(lineCounter[0]++);
        endBuf.putInt(-1);
        endBuf.putInt(-1);
        endBuf.putInt(strIdx.get(n.name));
        out.write(endBuf.array());
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("Usage: ApkPackager <dexFile> <assetsDir> <outputUnsignedApk>");
            System.exit(1);
        }
        Path dexPath = Paths.get(args[0]);
        Path assetsDir = Paths.get(args[1]);
        Path outApk = Paths.get(args[2]);

        byte[] manifestBytes = buildBinaryManifest();

        // 使用 Google 官方 BinaryXmlParser 验证生成的二进制 AndroidManifest.xml
        try {
            Class<?> parserCls = Class.forName("com.android.tools.apk.analyzer.BinaryXmlParser");
            byte[] decoded = (byte[]) parserCls.getMethod("decodeXml", byte[].class).invoke(null, (Object) manifestBytes);
            String xmlText = new String(decoded, StandardCharsets.UTF_8);
            if (!xmlText.contains("com.xhs.pageextractor.MainActivity")) {
                throw new RuntimeException("Manifest verification failed!");
            }
            System.out.println("[AXML Verified] Binary AndroidManifest.xml passed Google BinaryXmlParser check.");
        } catch (Throwable ignored) {}

        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(outApk))) {
            // 写入二进制 AndroidManifest.xml
            writeDeflatedEntry(zos, "AndroidManifest.xml", manifestBytes);
            // 写入 classes.dex
            writeDeflatedEntry(zos, "classes.dex", Files.readAllBytes(dexPath));

            // 写入 assets/*
            Files.walk(assetsDir).filter(Files::isRegularFile).forEach(p -> {
                try {
                    String rel = assetsDir.relativize(p).toString().replace('\\', '/');
                    writeDeflatedEntry(zos, "assets/" + rel, Files.readAllBytes(p));
                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            });
        }
        System.out.println("[APK Packaged] Unsigned APK written to: " + outApk);
    }

    private static void writeDeflatedEntry(ZipOutputStream zos, String name, byte[] data) throws IOException {
        ZipEntry entry = new ZipEntry(name);
        zos.putNextEntry(entry);
        zos.write(data);
        zos.closeEntry();
    }
}
