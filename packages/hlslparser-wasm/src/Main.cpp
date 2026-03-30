/**
 * Emscripten entry point for projectM's hlslparser fork.
 * Exposes the same parseHLSL(source, entryName, type) C signature as jberg's
 * hlslparser-js, but targets GLSL ES 3.0 with NaN propagation compatibility.
 *
 * Based on: https://github.com/jberg/hlslparser-js/blob/master/src/Main.cpp
 * Modified for projectM's API changes (separate Parse call, Options struct).
 */
#include "../vendor/hlslparser/src/GLSLGenerator.h"
#include "../vendor/hlslparser/src/HLSLParser.h"
#include "../vendor/hlslparser/src/HLSLTree.h"

extern "C" {
    const char* parseHLSL(char* source, char* entryName, char* type)
    {
        using namespace M4;
        const char* fileName = "filename.hlsl";
        GLSLGenerator::Target target = GLSLGenerator::Target_FragmentShader;
        if (String_Equal(type, "vs")) {
            target = GLSLGenerator::Target_VertexShader;
        }
        Allocator allocator;
        HLSLTree tree(&allocator);
        HLSLParser parser(&allocator, &tree);
        if (!parser.Parse(fileName, source, strlen(source)))
        {
            const char* ret = "parsing failed";
            return ret;
        }
        GLSLGenerator generator;
        GLSLGenerator::Options options(GLSLGenerator::Flag_AlternateNanPropagation);
        if (!generator.Generate(&tree, target, GLSLGenerator::Version_300_ES, entryName, options)) {
            const char* ret = "code generation failed";
            return ret;
        }
        const char *result = generator.GetResult();
        return result;
    }
}
