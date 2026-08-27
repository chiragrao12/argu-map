#!/usr/bin/env python3
"""
Backend API tests for Scaffold app
Tests all endpoints in the specified order
"""
import requests
import json
import time

BASE_URL = "http://localhost:3000/api"

def log_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  Details: {details}")

def verify_uuid(value, field_name):
    """Verify that a value is a valid UUID format"""
    if not isinstance(value, str):
        return False
    parts = value.split('-')
    if len(parts) != 5:
        return False
    if len(parts[0]) != 8 or len(parts[1]) != 4 or len(parts[2]) != 4 or len(parts[3]) != 4 or len(parts[4]) != 12:
        return False
    return True

def verify_no_mongo_id(obj, path=""):
    """Recursively verify no _id field exists"""
    if isinstance(obj, dict):
        if '_id' in obj:
            return False, f"Found _id at {path}"
        for key, value in obj.items():
            result, msg = verify_no_mongo_id(value, f"{path}.{key}" if path else key)
            if not result:
                return False, msg
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            result, msg = verify_no_mongo_id(item, f"{path}[{i}]")
            if not result:
                return False, msg
    return True, ""

def test_seed():
    """Test 1: POST /api/seed"""
    print("\n" + "="*60)
    print("TEST 1: POST /api/seed")
    print("="*60)
    
    try:
        resp = requests.post(f"{BASE_URL}/seed", json={}, timeout=10)
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text[:500]}")
        
        if resp.status_code != 200:
            log_test("Seed endpoint", False, f"Expected 200, got {resp.status_code}")
            return False
        
        data = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(data)
        if not no_id:
            log_test("Seed endpoint - no _id", False, msg)
            return False
        
        # Verify response structure
        if not data.get('ok'):
            log_test("Seed endpoint", False, "ok field not true")
            return False
        
        if data.get('nodes') != 9:
            log_test("Seed endpoint", False, f"Expected 9 nodes, got {data.get('nodes')}")
            return False
        
        if data.get('edges') != 7:
            log_test("Seed endpoint", False, f"Expected 7 edges, got {data.get('edges')}")
            return False
        
        log_test("Seed endpoint", True, "Created 9 nodes and 7 edges")
        return True
        
    except Exception as e:
        log_test("Seed endpoint", False, f"Exception: {str(e)}")
        return False

def test_get_nodes():
    """Test 2: GET /api/nodes"""
    print("\n" + "="*60)
    print("TEST 2: GET /api/nodes")
    print("="*60)
    
    try:
        resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log_test("GET nodes", False, f"Expected 200, got {resp.status_code}")
            return False, None
        
        nodes = resp.json()
        print(f"Got {len(nodes)} nodes")
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(nodes)
        if not no_id:
            log_test("GET nodes - no _id", False, msg)
            return False, None
        
        if len(nodes) != 9:
            log_test("GET nodes", False, f"Expected 9 nodes, got {len(nodes)}")
            return False, None
        
        # Verify all nodes have UUID ids
        for node in nodes:
            if not verify_uuid(node.get('id'), 'id'):
                log_test("GET nodes - UUID check", False, f"Node {node.get('id')} is not a valid UUID")
                return False, None
        
        # Find specific nodes by outline_number
        claim = next((n for n in nodes if n.get('outline_number') == '1.1'), None)
        premise1 = next((n for n in nodes if n.get('outline_number') == '2.1'), None)
        premise2 = next((n for n in nodes if n.get('outline_number') == '2.2'), None)
        objection = next((n for n in nodes if n.get('outline_number') == '2.3'), None)
        
        if not claim:
            log_test("GET nodes - claim 1.1", False, "Claim with outline_number 1.1 not found")
            return False, None
        
        if claim.get('type') != 'claim':
            log_test("GET nodes - claim type", False, f"Node 1.1 should be type 'claim', got '{claim.get('type')}'")
            return False, None
        
        if not premise1:
            log_test("GET nodes - premise 2.1", False, "Premise with outline_number 2.1 not found")
            return False, None
        
        if premise1.get('type') != 'premise':
            log_test("GET nodes - premise1 type", False, f"Node 2.1 should be type 'premise', got '{premise1.get('type')}'")
            return False, None
        
        if not premise2:
            log_test("GET nodes - premise 2.2", False, "Premise with outline_number 2.2 not found")
            return False, None
        
        if premise2.get('type') != 'premise':
            log_test("GET nodes - premise2 type", False, f"Node 2.2 should be type 'premise', got '{premise2.get('type')}'")
            return False, None
        
        if not objection:
            log_test("GET nodes - objection 2.3", False, "Objection with outline_number 2.3 not found")
            return False, None
        
        if objection.get('type') != 'objection':
            log_test("GET nodes - objection type", False, f"Node 2.3 should be type 'objection', got '{objection.get('type')}'")
            return False, None
        
        # Verify task nodes have status field
        tasks = [n for n in nodes if n.get('type') == 'task']
        print(f"Found {len(tasks)} task nodes")
        for task in tasks:
            if 'status' not in task:
                log_test("GET nodes - task status", False, f"Task {task.get('id')} missing status field")
                return False, None
        
        # Verify note nodes have type "note"
        notes = [n for n in nodes if n.get('type') == 'note']
        print(f"Found {len(notes)} note nodes")
        if len(notes) != 2:
            log_test("GET nodes - notes count", False, f"Expected 2 notes, got {len(notes)}")
            return False, None
        
        log_test("GET nodes", True, f"All 9 nodes verified with correct outline_numbers and types")
        return True, {'claim': claim, 'premise1': premise1, 'premise2': premise2, 'objection': objection}
        
    except Exception as e:
        log_test("GET nodes", False, f"Exception: {str(e)}")
        return False, None

def test_get_edges():
    """Test 3: GET /api/edges"""
    print("\n" + "="*60)
    print("TEST 3: GET /api/edges")
    print("="*60)
    
    try:
        resp = requests.get(f"{BASE_URL}/edges", timeout=10)
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            log_test("GET edges", False, f"Expected 200, got {resp.status_code}")
            return False
        
        edges = resp.json()
        print(f"Got {len(edges)} edges")
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(edges)
        if not no_id:
            log_test("GET edges - no _id", False, msg)
            return False
        
        if len(edges) != 7:
            log_test("GET edges", False, f"Expected 7 edges, got {len(edges)}")
            return False
        
        # Verify all edges have UUID ids
        for edge in edges:
            if not verify_uuid(edge.get('id'), 'id'):
                log_test("GET edges - UUID check", False, f"Edge {edge.get('id')} is not a valid UUID")
                return False
        
        # Count relations
        supports = [e for e in edges if e.get('relation') == 'supports']
        objects_to = [e for e in edges if e.get('relation') == 'objects_to']
        backlink = [e for e in edges if e.get('relation') == 'backlink']
        follow_up = [e for e in edges if e.get('relation') == 'follow_up']
        
        print(f"Relations: supports={len(supports)}, objects_to={len(objects_to)}, backlink={len(backlink)}, follow_up={len(follow_up)}")
        
        if len(supports) != 2:
            log_test("GET edges - supports", False, f"Expected 2 supports edges, got {len(supports)}")
            return False
        
        # Verify both supports edges share a joint_group_id
        jg1 = supports[0].get('joint_group_id')
        jg2 = supports[1].get('joint_group_id')
        if not jg1 or not jg2:
            log_test("GET edges - joint_group_id", False, "Supports edges missing joint_group_id")
            return False
        if jg1 != jg2:
            log_test("GET edges - joint_group_id", False, f"Supports edges have different joint_group_ids: {jg1} vs {jg2}")
            return False
        
        if len(objects_to) != 1:
            log_test("GET edges - objects_to", False, f"Expected 1 objects_to edge, got {len(objects_to)}")
            return False
        
        if len(backlink) != 2:
            log_test("GET edges - backlink", False, f"Expected 2 backlink edges, got {len(backlink)}")
            return False
        
        if len(follow_up) != 2:
            log_test("GET edges - follow_up", False, f"Expected 2 follow_up edges, got {len(follow_up)}")
            return False
        
        log_test("GET edges", True, "All 7 edges verified with correct relations")
        return True
        
    except Exception as e:
        log_test("GET edges", False, f"Exception: {str(e)}")
        return False

def test_create_nodes():
    """Test 4: POST /api/nodes (create claim and premise)"""
    print("\n" + "="*60)
    print("TEST 4: POST /api/nodes (create nodes)")
    print("="*60)
    
    try:
        # Create a claim
        resp = requests.post(f"{BASE_URL}/nodes", json={
            "type": "claim",
            "title": "Test claim for verification"
        }, timeout=10)
        
        print(f"Create claim status: {resp.status_code}")
        
        if resp.status_code != 200:
            log_test("Create claim", False, f"Expected 200, got {resp.status_code}")
            return False, None, None
        
        claim = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(claim)
        if not no_id:
            log_test("Create claim - no _id", False, msg)
            return False, None, None
        
        # Verify UUID
        if not verify_uuid(claim.get('id'), 'id'):
            log_test("Create claim - UUID", False, f"Claim id {claim.get('id')} is not a valid UUID")
            return False, None, None
        
        # Verify outline_number is of form "1.x"
        outline = claim.get('outline_number')
        if not outline or not outline.startswith('1.'):
            log_test("Create claim - outline_number", False, f"Expected outline_number to start with '1.', got '{outline}'")
            return False, None, None
        
        log_test("Create claim", True, f"Created claim with id {claim.get('id')} and outline_number {outline}")
        
        # Create a premise
        resp = requests.post(f"{BASE_URL}/nodes", json={
            "type": "premise",
            "title": "Test premise for verification"
        }, timeout=10)
        
        print(f"Create premise status: {resp.status_code}")
        
        if resp.status_code != 200:
            log_test("Create premise", False, f"Expected 200, got {resp.status_code}")
            return False, claim, None
        
        premise = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(premise)
        if not no_id:
            log_test("Create premise - no _id", False, msg)
            return False, claim, None
        
        # Verify UUID
        if not verify_uuid(premise.get('id'), 'id'):
            log_test("Create premise - UUID", False, f"Premise id {premise.get('id')} is not a valid UUID")
            return False, claim, None
        
        log_test("Create premise", True, f"Created premise with id {premise.get('id')}")
        
        return True, claim, premise
        
    except Exception as e:
        log_test("Create nodes", False, f"Exception: {str(e)}")
        return False, None, None

def test_create_edge_and_renumber(claim_id, premise_id):
    """Test 5: POST /api/edges and verify re-numbering"""
    print("\n" + "="*60)
    print("TEST 5: POST /api/edges (create supports edge)")
    print("="*60)
    
    try:
        # Create supports edge
        resp = requests.post(f"{BASE_URL}/edges", json={
            "source_id": premise_id,
            "target_id": claim_id,
            "relation": "supports"
        }, timeout=10)
        
        print(f"Create edge status: {resp.status_code}")
        
        if resp.status_code != 200:
            log_test("Create supports edge", False, f"Expected 200, got {resp.status_code}")
            return False
        
        edge = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(edge)
        if not no_id:
            log_test("Create edge - no _id", False, msg)
            return False
        
        # Verify UUID
        if not verify_uuid(edge.get('id'), 'id'):
            log_test("Create edge - UUID", False, f"Edge id {edge.get('id')} is not a valid UUID")
            return False
        
        log_test("Create supports edge", True, f"Created edge with id {edge.get('id')}")
        
        # Now GET nodes and verify the premise was re-parented and re-numbered
        resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if resp.status_code != 200:
            log_test("GET nodes after edge", False, f"Expected 200, got {resp.status_code}")
            return False
        
        nodes = resp.json()
        premise = next((n for n in nodes if n.get('id') == premise_id), None)
        
        if not premise:
            log_test("Verify premise after edge", False, f"Premise {premise_id} not found")
            return False
        
        # Verify parent_id is now the claim id
        if premise.get('parent_id') != claim_id:
            log_test("Verify premise parent_id", False, f"Expected parent_id={claim_id}, got {premise.get('parent_id')}")
            return False
        
        # Verify outline_number changed to "2.x" form
        outline = premise.get('outline_number')
        if not outline or not outline.startswith('2.'):
            log_test("Verify premise re-numbering", False, f"Expected outline_number to start with '2.', got '{outline}'")
            return False
        
        log_test("Verify re-parenting and re-numbering", True, f"Premise parent_id={claim_id}, outline_number={outline}")
        
        return True
        
    except Exception as e:
        log_test("Create edge and renumber", False, f"Exception: {str(e)}")
        return False

def test_update_node(node_id):
    """Test 6: PUT /api/nodes/:id"""
    print("\n" + "="*60)
    print("TEST 6: PUT /api/nodes/:id (update node)")
    print("="*60)
    
    try:
        # Get original node first
        resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if resp.status_code != 200:
            log_test("GET nodes before update", False, f"Expected 200, got {resp.status_code}")
            return False
        
        nodes = resp.json()
        original = next((n for n in nodes if n.get('id') == node_id), None)
        if not original:
            log_test("Find node to update", False, f"Node {node_id} not found")
            return False
        
        original_updated_at = original.get('updated_at')
        
        # Update the node
        time.sleep(0.1)  # Small delay to ensure updated_at changes
        resp = requests.put(f"{BASE_URL}/nodes/{node_id}", json={
            "title": "Updated title for testing"
        }, timeout=10)
        
        print(f"Update node status: {resp.status_code}")
        
        if resp.status_code != 200:
            log_test("Update node", False, f"Expected 200, got {resp.status_code}")
            return False
        
        updated = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(updated)
        if not no_id:
            log_test("Update node - no _id", False, msg)
            return False
        
        # Verify title changed
        if updated.get('title') != "Updated title for testing":
            log_test("Update node - title", False, f"Expected 'Updated title for testing', got '{updated.get('title')}'")
            return False
        
        # Verify updated_at changed
        new_updated_at = updated.get('updated_at')
        if new_updated_at == original_updated_at:
            log_test("Update node - updated_at", False, f"updated_at did not change: {original_updated_at}")
            return False
        
        log_test("Update node", True, f"Title updated and updated_at changed from {original_updated_at} to {new_updated_at}")
        
        return True
        
    except Exception as e:
        log_test("Update node", False, f"Exception: {str(e)}")
        return False

def test_delete_node_with_edges():
    """Test 7: DELETE /api/nodes/:id (node with edges)"""
    print("\n" + "="*60)
    print("TEST 7: DELETE /api/nodes/:id (with edges)")
    print("="*60)
    
    try:
        # Get a node that has edges
        resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if resp.status_code != 200:
            log_test("GET nodes before delete", False, f"Expected 200, got {resp.status_code}")
            return False
        
        nodes = resp.json()
        
        # Find a premise node (should have a supports edge)
        premise = next((n for n in nodes if n.get('type') == 'premise' and n.get('outline_number') == '2.1'), None)
        if not premise:
            log_test("Find node to delete", False, "Could not find premise 2.1")
            return False
        
        node_id = premise.get('id')
        print(f"Deleting node {node_id} (premise 2.1)")
        
        # Get edges before delete
        resp = requests.get(f"{BASE_URL}/edges", timeout=10)
        if resp.status_code != 200:
            log_test("GET edges before delete", False, f"Expected 200, got {resp.status_code}")
            return False
        
        edges_before = resp.json()
        edges_with_node = [e for e in edges_before if e.get('source_id') == node_id or e.get('target_id') == node_id]
        print(f"Found {len(edges_with_node)} edges connected to this node")
        
        # Delete the node
        resp = requests.delete(f"{BASE_URL}/nodes/{node_id}", timeout=10)
        
        print(f"Delete node status: {resp.status_code}")
        
        if resp.status_code != 200:
            log_test("Delete node", False, f"Expected 200, got {resp.status_code}")
            return False
        
        result = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(result)
        if not no_id:
            log_test("Delete node - no _id", False, msg)
            return False
        
        if not result.get('ok'):
            log_test("Delete node", False, "ok field not true")
            return False
        
        log_test("Delete node", True, f"Node {node_id} deleted")
        
        # Verify edges are gone
        resp = requests.get(f"{BASE_URL}/edges", timeout=10)
        if resp.status_code != 200:
            log_test("GET edges after delete", False, f"Expected 200, got {resp.status_code}")
            return False
        
        edges_after = resp.json()
        edges_with_deleted_node = [e for e in edges_after if e.get('source_id') == node_id or e.get('target_id') == node_id]
        
        if len(edges_with_deleted_node) > 0:
            log_test("Verify edges deleted", False, f"Found {len(edges_with_deleted_node)} edges still referencing deleted node")
            return False
        
        log_test("Verify edges deleted", True, f"All {len(edges_with_node)} edges referencing the node were deleted")
        
        return True
        
    except Exception as e:
        log_test("Delete node with edges", False, f"Exception: {str(e)}")
        return False

def test_ai_chat(claim_id):
    """Test 8: POST /api/ai/chat"""
    print("\n" + "="*60)
    print("TEST 8: POST /api/ai/chat (RAG with real LLM)")
    print("="*60)
    
    try:
        print("Calling AI chat endpoint (may take up to 40s)...")
        start = time.time()
        
        resp = requests.post(f"{BASE_URL}/ai/chat", json={
            "message": "What have I written about AI and knowledge work?"
        }, timeout=45)
        
        elapsed = time.time() - start
        print(f"AI chat response time: {elapsed:.2f}s")
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"Response body: {resp.text[:500]}")
            log_test("AI chat", False, f"Expected 200, got {resp.status_code}. Response: {resp.text[:200]}")
            return False
        
        data = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(data)
        if not no_id:
            log_test("AI chat - no _id", False, msg)
            return False
        
        # Verify answer is non-empty
        answer = data.get('answer')
        if not answer or not isinstance(answer, str) or len(answer.strip()) == 0:
            log_test("AI chat - answer", False, f"Expected non-empty answer string, got: {answer}")
            return False
        
        print(f"Answer length: {len(answer)} chars")
        print(f"Answer preview: {answer[:200]}...")
        
        # Verify sources is an array
        sources = data.get('sources')
        if not isinstance(sources, list):
            log_test("AI chat - sources", False, f"Expected sources to be array, got: {type(sources)}")
            return False
        
        print(f"Sources count: {len(sources)}")
        
        log_test("AI chat", True, f"Got answer ({len(answer)} chars) and {len(sources)} sources in {elapsed:.2f}s")
        
        return True
        
    except requests.exceptions.Timeout:
        log_test("AI chat", False, "Request timed out after 45s")
        return False
    except Exception as e:
        log_test("AI chat", False, f"Exception: {str(e)}")
        return False

def test_ai_critique(claim_id):
    """Test 9: POST /api/ai/critique"""
    print("\n" + "="*60)
    print("TEST 9: POST /api/ai/critique (real LLM)")
    print("="*60)
    
    try:
        print(f"Calling AI critique endpoint for claim {claim_id} (may take up to 40s)...")
        start = time.time()
        
        resp = requests.post(f"{BASE_URL}/ai/critique", json={
            "node_id": claim_id
        }, timeout=45)
        
        elapsed = time.time() - start
        print(f"AI critique response time: {elapsed:.2f}s")
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"Response body: {resp.text[:500]}")
            log_test("AI critique", False, f"Expected 200, got {resp.status_code}. Response: {resp.text[:200]}")
            return False
        
        data = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(data)
        if not no_id:
            log_test("AI critique - no _id", False, msg)
            return False
        
        # Verify critique is non-empty markdown string
        critique = data.get('critique')
        if not critique or not isinstance(critique, str) or len(critique.strip()) == 0:
            log_test("AI critique - critique", False, f"Expected non-empty critique string, got: {critique}")
            return False
        
        print(f"Critique length: {len(critique)} chars")
        print(f"Critique preview: {critique[:300]}...")
        
        # Check if it mentions premise (should mention weakest premise)
        if 'premise' not in critique.lower():
            print("WARNING: Critique does not mention 'premise' - may not be following instructions")
        
        log_test("AI critique", True, f"Got critique ({len(critique)} chars) in {elapsed:.2f}s")
        
        return True
        
    except requests.exceptions.Timeout:
        log_test("AI critique", False, "Request timed out after 45s")
        return False
    except Exception as e:
        log_test("AI critique", False, f"Exception: {str(e)}")
        return False

def test_ai_suggest_objection(claim_id):
    """Test 10: POST /api/ai/suggest-objection"""
    print("\n" + "="*60)
    print("TEST 10: POST /api/ai/suggest-objection (real LLM)")
    print("="*60)
    
    try:
        print(f"Calling AI suggest-objection endpoint for claim {claim_id} (may take up to 40s)...")
        start = time.time()
        
        resp = requests.post(f"{BASE_URL}/ai/suggest-objection", json={
            "node_id": claim_id
        }, timeout=45)
        
        elapsed = time.time() - start
        print(f"AI suggest-objection response time: {elapsed:.2f}s")
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"Response body: {resp.text[:500]}")
            log_test("AI suggest-objection", False, f"Expected 200, got {resp.status_code}. Response: {resp.text[:200]}")
            return False
        
        data = resp.json()
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(data)
        if not no_id:
            log_test("AI suggest-objection - no _id", False, msg)
            return False
        
        # Verify objection structure
        objection = data.get('objection')
        if not objection or not isinstance(objection, dict):
            log_test("AI suggest-objection - objection", False, f"Expected objection object, got: {type(objection)}")
            return False
        
        title = objection.get('title')
        content = objection.get('content')
        
        if not title or not isinstance(title, str) or len(title.strip()) == 0:
            log_test("AI suggest-objection - title", False, f"Expected non-empty title string, got: {title}")
            return False
        
        if not content or not isinstance(content, str) or len(content.strip()) == 0:
            log_test("AI suggest-objection - content", False, f"Expected non-empty content string, got: {content}")
            return False
        
        print(f"Objection title: {title}")
        print(f"Objection content: {content}")
        
        log_test("AI suggest-objection", True, f"Got objection with title and content in {elapsed:.2f}s")
        
        return True
        
    except requests.exceptions.Timeout:
        log_test("AI suggest-objection", False, "Request timed out after 45s")
        return False
    except Exception as e:
        log_test("AI suggest-objection", False, f"Exception: {str(e)}")
        return False

def main():
    print("\n" + "="*60)
    print("SCAFFOLD BACKEND API TEST SUITE")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print("="*60)
    
    results = {}
    
    # Test 1: Seed
    results['seed'] = test_seed()
    
    # Test 2: Get nodes
    success, seeded_nodes = test_get_nodes()
    results['get_nodes'] = success
    
    # Test 3: Get edges
    results['get_edges'] = test_get_edges()
    
    # Test 4: Create nodes
    success, new_claim, new_premise = test_create_nodes()
    results['create_nodes'] = success
    
    # Test 5: Create edge and verify re-numbering
    if new_claim and new_premise:
        results['create_edge_renumber'] = test_create_edge_and_renumber(new_claim.get('id'), new_premise.get('id'))
    else:
        results['create_edge_renumber'] = False
        log_test("Create edge and renumber", False, "Skipped - no nodes to test with")
    
    # Test 6: Update node
    if new_claim:
        results['update_node'] = test_update_node(new_claim.get('id'))
    else:
        results['update_node'] = False
        log_test("Update node", False, "Skipped - no node to test with")
    
    # Test 7: Delete node with edges
    results['delete_node'] = test_delete_node_with_edges()
    
    # Test 8: AI chat
    if seeded_nodes and seeded_nodes.get('claim'):
        results['ai_chat'] = test_ai_chat(seeded_nodes['claim'].get('id'))
    else:
        results['ai_chat'] = False
        log_test("AI chat", False, "Skipped - no claim to test with")
    
    # Test 9: AI critique
    if seeded_nodes and seeded_nodes.get('claim'):
        results['ai_critique'] = test_ai_critique(seeded_nodes['claim'].get('id'))
    else:
        results['ai_critique'] = False
        log_test("AI critique", False, "Skipped - no claim to test with")
    
    # Test 10: AI suggest-objection
    if seeded_nodes and seeded_nodes.get('claim'):
        results['ai_suggest_objection'] = test_ai_suggest_objection(seeded_nodes['claim'].get('id'))
    else:
        results['ai_suggest_objection'] = False
        log_test("AI suggest-objection", False, "Skipped - no claim to test with")
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("="*60)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*60)
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
