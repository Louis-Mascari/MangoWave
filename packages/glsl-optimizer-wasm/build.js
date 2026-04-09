// based on https://github.com/zz85/glsl-optimizer/blob/gh-pages/buildem.js
const fs = require('fs');
const exec = require('child_process').exec;

const DEBUG = false;
const DEBUG_FLAGS = '-g';
const OPTIMIZE_FLAGS = ' -O3';

let FLAGS = DEBUG ? DEBUG_FLAGS : OPTIMIZE_FLAGS;

const switches = {
  TOTAL_MEMORY: 33554432, // 67108864 - 64MB
  // NO_EXIT_RUNTIME: 0,
  // EMTERPRETIFY: 1,
  // ALLOW_MEMORY_GROWTH: 1,
  // DEMANGLE_SUPPORT: 1,
  // ASSERTIONS: 2,
  // EMULATE_FUNCTION_POINTER_CASTS: 1
};

FLAGS +=
  ' ' +
  Object.keys(switches)
    .map(function (s) {
      return '-s ' + s + '=' + switches[s];
    })
    .join(' ');

const includes = [
  //  libmesa
  'glsl-optimizer/src/mesa/program/prog_hash_table.c',
  'glsl-optimizer/src/mesa/program/symbol_table.c',
  'glsl-optimizer/src/mesa/main/imports.c',

  // libglcpp
  'glsl-optimizer/src/glsl/glcpp/glcpp-lex.c',
  'glsl-optimizer/src/glsl/glcpp/glcpp-parse.c',
  'glsl-optimizer/src/glsl/glcpp/pp.c',
  'glsl-optimizer/src/util/hash_table.c',
  'glsl-optimizer/src/util/ralloc.c',

  // libglslopt
  'glsl-optimizer/src/glsl/ast_array_index.cpp',
  'glsl-optimizer/src/glsl/ast_expr.cpp',
  'glsl-optimizer/src/glsl/ast_function.cpp',
  'glsl-optimizer/src/glsl/ast_to_hir.cpp',
  'glsl-optimizer/src/glsl/ast_type.cpp',
  'glsl-optimizer/src/glsl/builtin_functions.cpp',
  'glsl-optimizer/src/glsl/builtin_types.cpp',
  'glsl-optimizer/src/glsl/builtin_variables.cpp',
  'glsl-optimizer/src/glsl/glsl_lexer.cpp',
  'glsl-optimizer/src/glsl/glsl_optimizer.cpp',
  'glsl-optimizer/src/glsl/glsl_parser.cpp',
  'glsl-optimizer/src/glsl/glsl_parser_extras.cpp',
  'glsl-optimizer/src/glsl/glsl_symbol_table.cpp',
  'glsl-optimizer/src/glsl/glsl_types.cpp',
  'glsl-optimizer/src/glsl/hir_field_selection.cpp',
  'glsl-optimizer/src/glsl/ir.cpp',
  'glsl-optimizer/src/glsl/ir_basic_block.cpp',
  'glsl-optimizer/src/glsl/ir_builder.cpp',
  'glsl-optimizer/src/glsl/ir_clone.cpp',
  'glsl-optimizer/src/glsl/ir_constant_expression.cpp',
  'glsl-optimizer/src/glsl/ir_equals.cpp',
  'glsl-optimizer/src/glsl/ir_expression_flattening.cpp',
  'glsl-optimizer/src/glsl/ir_function.cpp',
  'glsl-optimizer/src/glsl/ir_function_can_inline.cpp',
  'glsl-optimizer/src/glsl/ir_function_detect_recursion.cpp',
  'glsl-optimizer/src/glsl/ir_hierarchical_visitor.cpp',
  'glsl-optimizer/src/glsl/ir_hv_accept.cpp',
  'glsl-optimizer/src/glsl/ir_import_prototypes.cpp',
  'glsl-optimizer/src/glsl/ir_print_glsl_visitor.cpp',
  'glsl-optimizer/src/glsl/ir_print_metal_visitor.cpp',
  'glsl-optimizer/src/glsl/ir_print_visitor.cpp',
  'glsl-optimizer/src/glsl/ir_rvalue_visitor.cpp',
  'glsl-optimizer/src/glsl/ir_stats.cpp',
  'glsl-optimizer/src/glsl/ir_unused_structs.cpp',
  'glsl-optimizer/src/glsl/ir_validate.cpp',
  'glsl-optimizer/src/glsl/ir_variable_refcount.cpp',
  'glsl-optimizer/src/glsl/link_atomics.cpp',
  'glsl-optimizer/src/glsl/link_functions.cpp',
  'glsl-optimizer/src/glsl/link_interface_blocks.cpp',
  'glsl-optimizer/src/glsl/link_uniform_block_active_visitor.cpp',
  'glsl-optimizer/src/glsl/link_uniform_blocks.cpp',
  'glsl-optimizer/src/glsl/link_uniform_initializers.cpp',
  'glsl-optimizer/src/glsl/link_uniforms.cpp',
  'glsl-optimizer/src/glsl/link_varyings.cpp',
  'glsl-optimizer/src/glsl/linker.cpp',
  'glsl-optimizer/src/glsl/loop_analysis.cpp',
  'glsl-optimizer/src/glsl/loop_controls.cpp',
  'glsl-optimizer/src/glsl/loop_unroll.cpp',
  'glsl-optimizer/src/glsl/lower_clip_distance.cpp',
  'glsl-optimizer/src/glsl/lower_discard.cpp',
  'glsl-optimizer/src/glsl/lower_discard_flow.cpp',
  'glsl-optimizer/src/glsl/lower_if_to_cond_assign.cpp',
  'glsl-optimizer/src/glsl/lower_instructions.cpp',
  'glsl-optimizer/src/glsl/lower_jumps.cpp',
  'glsl-optimizer/src/glsl/lower_mat_op_to_vec.cpp',
  'glsl-optimizer/src/glsl/lower_named_interface_blocks.cpp',
  'glsl-optimizer/src/glsl/lower_noise.cpp',
  'glsl-optimizer/src/glsl/lower_offset_array.cpp',
  'glsl-optimizer/src/glsl/lower_output_reads.cpp',
  'glsl-optimizer/src/glsl/lower_packed_varyings.cpp',
  'glsl-optimizer/src/glsl/lower_packing_builtins.cpp',
  'glsl-optimizer/src/glsl/lower_ubo_reference.cpp',
  'glsl-optimizer/src/glsl/lower_variable_index_to_cond_assign.cpp',
  'glsl-optimizer/src/glsl/lower_vec_index_to_cond_assign.cpp',
  'glsl-optimizer/src/glsl/lower_vec_index_to_swizzle.cpp',
  'glsl-optimizer/src/glsl/lower_vector.cpp',
  'glsl-optimizer/src/glsl/lower_vector_insert.cpp',
  'glsl-optimizer/src/glsl/lower_vertex_id.cpp',
  'glsl-optimizer/src/glsl/opt_algebraic.cpp',
  'glsl-optimizer/src/glsl/opt_array_splitting.cpp',
  'glsl-optimizer/src/glsl/opt_constant_folding.cpp',
  'glsl-optimizer/src/glsl/opt_constant_propagation.cpp',
  'glsl-optimizer/src/glsl/opt_constant_variable.cpp',
  'glsl-optimizer/src/glsl/opt_copy_propagation.cpp',
  'glsl-optimizer/src/glsl/opt_copy_propagation_elements.cpp',
  'glsl-optimizer/src/glsl/opt_cse.cpp',
  'glsl-optimizer/src/glsl/opt_dead_builtin_variables.cpp',
  'glsl-optimizer/src/glsl/opt_dead_builtin_varyings.cpp',
  'glsl-optimizer/src/glsl/opt_dead_code.cpp',
  'glsl-optimizer/src/glsl/opt_dead_code_local.cpp',
  'glsl-optimizer/src/glsl/opt_dead_functions.cpp',
  'glsl-optimizer/src/glsl/opt_flatten_nested_if_blocks.cpp',
  'glsl-optimizer/src/glsl/opt_flip_matrices.cpp',
  'glsl-optimizer/src/glsl/opt_function_inlining.cpp',
  'glsl-optimizer/src/glsl/opt_if_simplification.cpp',
  'glsl-optimizer/src/glsl/opt_minmax.cpp',
  'glsl-optimizer/src/glsl/opt_noop_swizzle.cpp',
  'glsl-optimizer/src/glsl/opt_rebalance_tree.cpp',
  'glsl-optimizer/src/glsl/opt_redundant_jumps.cpp',
  'glsl-optimizer/src/glsl/opt_structure_splitting.cpp',
  'glsl-optimizer/src/glsl/opt_swizzle_swizzle.cpp',
  'glsl-optimizer/src/glsl/opt_tree_grafting.cpp',
  'glsl-optimizer/src/glsl/opt_vectorize.cpp',
  'glsl-optimizer/src/glsl/s_expression.cpp',
  'glsl-optimizer/src/glsl/strtod.c',
  'glsl-optimizer/src/glsl/standalone_scaffolding.cpp',
];

const compile_all =
  'emcc -Iglsl-optimizer/src -Iglsl-optimizer/src/mesa -Iglsl-optimizer/include -Iglsl-optimizer/src/glsl ' +
  includes.join(' ') +
  ' src/Main.cpp -DHAVE___BUILTIN_FFS=0 -DHAVE___BUILTIN_FFSLL=1 -o dist/glsl-optimizer.mjs -s \'EXPORT_NAME="GLSLOptimizer"\' -s EXPORTED_FUNCTIONS="[\'_optimize_glsl\']" -s EXPORTED_RUNTIME_METHODS="[\'cwrap\']" -s WASM=1 -s SINGLE_FILE=1 -s MODULARIZE=1 ' +
  FLAGS;

exec(compile_all, (error, stdout, stderr) => {
  if (stdout) console.log('stdout: ' + stdout);
  if (stderr) console.log('stderr: ' + stderr);
  if (error !== null) {
    console.log('exec error: ' + error);
  }
});
